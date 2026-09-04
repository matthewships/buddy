import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import { LATE_AFTER_MINUTES, NO_SHOW_AFTER_MINUTES, START_NUDGE_LEAD_MINUTES, nudgeText } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { nudges, sessionParticipants, sessions, tasks, users } from '../db/schema.js';
import type { Env } from '../env.js';
import { newId } from '../lib/ids.js';
import { localDate, nowIso } from '../lib/time.js';
import { latestStart } from '../services/pressure.js';
import { enqueuePush } from '../services/push.js';

/**
 * The quarter-hourly pressure job (PRODUCT.md §3.3, slice 2). Three things,
 * each idempotent through the `nudges` table or a participant state, so a
 * repeated firing changes nothing:
 *
 * 1. **The start nudge.** A task due today, with an estimate, not started,
 *    whose latest start is within the lead time: one push, once per task per
 *    day. Quiet hours are applied at delivery (`dropQuietRecipients`).
 * 2. **Late and absent.** In a live group session, a member still `committed`
 *    five minutes after the start is `late` and told; ten minutes after, they
 *    are `no_show`. Neither touches credits; both feed reliability.
 * 3. **Requested check-ins.** A check-in whose time has come is sent to the
 *    buddy who was asked, once.
 */
export interface PressureResult {
  startNudges: number;
  markedLate: number;
  markedAbsent: number;
  checkins: number;
}

export async function runPressure(db: Db, env: Env, now: Date = new Date()): Promise<PressureResult> {
  const startNudges = await sendStartNudges(db, env, now);
  const { markedLate, markedAbsent } = await markLateAndAbsent(db, env, now);
  const checkins = await sendDueCheckins(db, env, now);
  return { startNudges, markedLate, markedAbsent, checkins };
}

async function sendStartNudges(db: Db, env: Env, now: Date): Promise<number> {
  const zones = await db
    .selectDistinct({ timezone: users.timezone })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`);

  let sent = 0;
  for (const { timezone } of zones) {
    let today: string;
    try {
      today = localDate(timezone, now);
    } catch {
      continue;
    }

    const candidates = await db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        groupId: tasks.groupId,
        title: tasks.title,
        dueDate: tasks.dueDate,
        estimatedMinutes: tasks.estimatedMinutes,
        startBy: tasks.startBy,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'planned'),
          eq(tasks.dueDate, today),
          isNull(tasks.startedAt),
          sql`${tasks.estimatedMinutes} IS NOT NULL`,
          sql`${tasks.userId} IN (SELECT id FROM users WHERE timezone = ${timezone} AND deleted_at IS NULL)`,
          // Not already nudged about this task today.
          sql`NOT EXISTS (SELECT 1 FROM ${nudges} WHERE ${nudges.taskId} = ${tasks.id} AND ${nudges.kind} = 'start' AND ${nudges.day} = ${today})`,
        ),
      );

    for (const task of candidates) {
      const by = latestStart(task, timezone);
      if (!by) continue;
      const msUntil = Date.parse(by) - now.getTime();
      // Inside the lead window, and not already past it by more than the
      // window: a nudge about a task that could no longer fit is noise.
      if (msUntil > START_NUDGE_LEAD_MINUTES * 60_000 || msUntil < -START_NUDGE_LEAD_MINUTES * 60_000) continue;

      const id = newId();
      await db.insert(nudges).values({
        id,
        kind: 'start',
        taskId: task.id,
        toUserId: task.userId,
        day: today,
        sentAt: nowIso(),
      });
      const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(by));
      const hours = task.estimatedMinutes! >= 60 ? `${Math.round((task.estimatedMinutes! / 60) * 10) / 10}h` : `${task.estimatedMinutes}m`;
      await enqueuePush(env, {
        userIds: [task.userId],
        title: `${task.title} needs ${hours}`,
        body: `Start by ${time} to finish it today.`,
        data: { type: 'start_nudge', taskId: task.id, groupId: task.groupId, url: `/groups/${task.groupId}` },
      });
      sent += 1;
    }
  }
  return sent;
}

async function markLateAndAbsent(db: Db, env: Env, now: Date): Promise<{ markedLate: number; markedAbsent: number }> {
  const live = await db.query.sessions.findMany({
    where: and(eq(sessions.kind, 'group'), eq(sessions.state, 'live')),
    columns: { id: true, groupId: true, startedAt: true },
  });
  let markedLate = 0;
  let markedAbsent = 0;

  for (const session of live) {
    if (!session.startedAt) continue;
    const sinceStart = now.getTime() - Date.parse(session.startedAt);

    if (sinceStart >= NO_SHOW_AFTER_MINUTES * 60_000) {
      const absent = await db
        .update(sessionParticipants)
        .set({ state: 'no_show', onTime: 0 })
        .where(
          and(
            eq(sessionParticipants.sessionId, session.id),
            inArray(sessionParticipants.state, ['committed', 'late']),
            // A `late` row that has a join is somebody who arrived; only the never-joined are absent.
            isNull(sessionParticipants.joinedAt),
          ),
        )
        .returning({ userId: sessionParticipants.userId });
      markedAbsent += absent.length;
    }

    if (sinceStart >= LATE_AFTER_MINUTES * 60_000) {
      const late = await db
        .update(sessionParticipants)
        .set({ state: 'late' })
        .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.state, 'committed')))
        .returning({ userId: sessionParticipants.userId });
      markedLate += late.length;
      if (late.length > 0) {
        await enqueuePush(env, {
          userIds: late.map((p) => p.userId),
          title: 'Your session started without you',
          body: 'Tap to join. Late is fine; absent is not.',
          data: { type: 'start_nudge', sessionId: session.id, groupId: session.groupId, url: `/groups/${session.groupId}` },
        });
      }
    }
  }
  return { markedLate, markedAbsent };
}

async function sendDueCheckins(db: Db, env: Env, now: Date): Promise<number> {
  const due = await db
    .select({
      id: nudges.id,
      taskId: nudges.taskId,
      buddyId: nudges.fromUserId,
      ownerId: nudges.toUserId,
    })
    .from(nudges)
    .where(and(eq(nudges.kind, 'checkin'), isNull(nudges.sentAt), lte(nudges.scheduledFor, now.toISOString())));

  let sent = 0;
  for (const checkin of due) {
    if (!checkin.buddyId) continue;
    const claimed = await db
      .update(nudges)
      .set({ sentAt: nowIso() })
      .where(and(eq(nudges.id, checkin.id), isNull(nudges.sentAt)))
      .returning({ id: nudges.id });
    if (claimed.length === 0) continue;

    const [owner, task] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, checkin.ownerId), columns: { displayName: true } }),
      checkin.taskId
        ? db.query.tasks.findFirst({ where: eq(tasks.id, checkin.taskId), columns: { title: true, groupId: true, startedAt: true } })
        : Promise.resolve(undefined),
    ]);
    await enqueuePush(env, {
      userIds: [checkin.buddyId],
      title: `${owner?.displayName ?? 'A buddy'} asked you to check on them now`,
      body: task ? `${task.title}${task.startedAt ? ' · clock running' : ' · not started yet'}` : nudgeText('checking'),
      data: {
        type: 'checkin',
        nudgeId: checkin.id,
        ...(task?.groupId ? { groupId: task.groupId, url: `/groups/${task.groupId}` } : {}),
      },
    });
    sent += 1;
  }
  return sent;
}
