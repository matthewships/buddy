import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import {
  COOP_SESSION_BONUS,
  DAILY_MINUTE_CREDIT_CAP,
  MAX_REST_DAYS_PER_WEEK,
  SESSION_STREAK_MINUTES,
  STREAK_FREEZES_PER_MONTH,
  sessionMinutes,
  unverifiedCredits,
  verifiedTopUp,
} from '@buddy/shared';

import type { Db } from '../db/client.js';
import {
  restDays,
  sessionCredits,
  sessionParticipants,
  sessionTasks,
  sessions,
  tasks,
  userStats,
  users,
  type Session,
} from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { isoWeekKey, localDateOrUtc, nowIso, previousLocalDate } from '../lib/time.js';
import { recomputeReliability } from './pressure.js';

/**
 * Sessions (PRODUCT.md §3.1, slice 1).
 *
 * A session is the object the task clock becomes once the group can see it.
 * Pressing Start on a task creates a *solo* session around it; a host opens a
 * *group* session for the room and members join it, with a task or without.
 * Ending one is where the economy happens: minutes are counted per person,
 * credited at the unverified rate, and the day is recorded for the streak.
 *
 * The same rules credits.ts follows apply here. D1 has no interactive
 * transactions, so every award is claimed by an insert into `session_credits`
 * under a unique index, and only a winning insert moves `user_stats`; and
 * counters are relative, never absolute.
 */

/** The session Start creates around one task. */
export async function startSoloSession(
  client: Db,
  task: { id: string; userId: string; groupId: string; estimatedMinutes: number },
  startedAt: string,
): Promise<string> {
  const id = newId();
  await client.batch([
    client.insert(sessions).values({
      id,
      groupId: task.groupId,
      hostId: task.userId,
      kind: 'solo',
      state: 'live',
      plannedMinutes: task.estimatedMinutes,
      startedAt,
    }),
    client.insert(sessionParticipants).values({
      sessionId: id,
      userId: task.userId,
      state: 'present',
      joinedAt: startedAt,
      lastSeenAt: startedAt,
    }),
    client.insert(sessionTasks).values({ sessionId: id, taskId: task.id }),
    client.update(tasks).set({ sessionId: id }).where(eq(tasks.id, task.id)),
  ]);
  return id;
}

/** The group's live group session, if one is running. */
export async function liveGroupSession(client: Db, groupId: string): Promise<Session | undefined> {
  return client.query.sessions.findFirst({
    where: and(eq(sessions.groupId, groupId), eq(sessions.kind, 'group'), eq(sessions.state, 'live')),
  });
}

/** Whether a member is present in a live group session of this group: the chat lock's second clause. */
export async function presentInLiveSession(client: Db, groupId: string, userId: string): Promise<boolean> {
  const row = await client
    .select({ sessionId: sessionParticipants.sessionId })
    .from(sessionParticipants)
    .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
    .where(
      and(
        eq(sessionParticipants.userId, userId),
        inArray(sessionParticipants.state, ['present', 'late']),
        eq(sessions.groupId, groupId),
        eq(sessions.kind, 'group'),
        eq(sessions.state, 'live'),
      ),
    )
    .limit(1);
  return row.length > 0;
}

/** Brings a task into a session: its clock now belongs there. */
export async function attachTask(client: Db, sessionId: string, taskId: string): Promise<void> {
  await client.batch([
    client.insert(sessionTasks).values({ sessionId, taskId }).onConflictDoNothing(),
    client.update(tasks).set({ sessionId }).where(eq(tasks.id, taskId)),
  ]);
}

/**
 * Books the minutes a running task has had since its clock started, on the
 * task and on its session row, and stops the clock. Called when a task is
 * marked done or dropped while its session goes on, and by `endSession` for
 * every clock still running when the session ends.
 */
export async function settleTaskClock(
  client: Db,
  task: { id: string; startedAt: string | null; estimatedMinutes: number | null; sessionId: string | null },
  until: string,
): Promise<number> {
  if (!task.startedAt) return 0;
  const minutes = sessionMinutes(task.startedAt, until, task.estimatedMinutes ?? 0);
  await client.batch([
    client
      .update(tasks)
      .set({ actualMinutes: sql`${tasks.actualMinutes} + ${minutes}`, startedAt: null })
      .where(eq(tasks.id, task.id)),
    ...(task.sessionId
      ? [
          client
            .update(sessionTasks)
            .set({ minutes: sql`${sessionTasks.minutes} + ${minutes}` })
            .where(and(eq(sessionTasks.sessionId, task.sessionId), eq(sessionTasks.taskId, task.id))),
        ]
      : []),
  ]);
  return minutes;
}

/**
 * One participant's exit, whether the session ended or they left early:
 * their minutes are counted, credited and recorded for the streak.
 */
async function settleParticipant(
  client: Db,
  session: Session,
  participant: { userId: string; joinedAt: string | null },
  at: string,
  state: 'completed' | 'left_early',
): Promise<number> {
  const from = participant.joinedAt ?? session.startedAt ?? at;
  const minutes = sessionMinutes(from, at, session.plannedMinutes);

  await client
    .update(sessionParticipants)
    .set({ state, leftAt: at, presentMinutes: minutes })
    .where(and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, participant.userId)));

  // Any of their tasks still on the clock in this session stop with them.
  const running = await client.query.tasks.findMany({
    where: and(eq(tasks.sessionId, session.id), eq(tasks.userId, participant.userId), isNotNull(tasks.startedAt)),
    columns: { id: true, startedAt: true, estimatedMinutes: true, sessionId: true },
  });
  for (const task of running) await settleTaskClock(client, task, at);

  const user = await client.query.users.findFirst({
    where: eq(users.id, participant.userId),
    columns: { timezone: true },
  });
  const day = localDateOrUtc(user?.timezone ?? 'UTC', new Date(at));

  await awardUnverifiedMinutes(client, participant.userId, session.id, minutes, day);
  await recordSessionDay(client, participant.userId, day, minutes);
  return minutes;
}

/** Leaving before the end. Minutes so far still count; the streak still counts. */
export async function leaveSession(client: Db, session: Session, userId: string, at: string): Promise<number> {
  const participant = await client.query.sessionParticipants.findFirst({
    where: and(eq(sessionParticipants.sessionId, session.id), eq(sessionParticipants.userId, userId)),
  });
  if (!participant || !['present', 'late'].includes(participant.state)) return 0;
  return settleParticipant(client, session, participant, at, 'left_early');
}

/**
 * Ends a live session: every present participant is settled, every clock in
 * it stops, and a group session where everybody who was present stayed to the
 * end pays each of them the cooperative bonus (PRODUCT.md §3.6).
 */
export async function endSession(client: Db, sessionId: string, at: string = nowIso()): Promise<void> {
  const session = await client.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session || session.state !== 'live') return;

  // Claim the close first, so two ends cannot settle the same people twice.
  const claimed = await client
    .update(sessions)
    .set({ state: 'ended', endedAt: at })
    .where(and(eq(sessions.id, sessionId), eq(sessions.state, 'live')))
    .returning({ id: sessions.id });
  if (claimed.length === 0) return;

  // Somebody still `committed` or `late` with no join when it ends never came.
  await client
    .update(sessionParticipants)
    .set({ state: 'no_show', onTime: 0 })
    .where(
      and(
        eq(sessionParticipants.sessionId, sessionId),
        inArray(sessionParticipants.state, ['committed', 'late']),
        sql`${sessionParticipants.joinedAt} IS NULL`,
      ),
    );

  const present = await client.query.sessionParticipants.findMany({
    where: and(eq(sessionParticipants.sessionId, sessionId), inArray(sessionParticipants.state, ['present', 'late'])),
  });
  for (const participant of present) await settleParticipant(client, session, participant, at, 'completed');

  // Belt and braces: a clock attached to this session that no participant row
  // owned is stopped rather than left running against an ended session.
  const strays = await client.query.tasks.findMany({
    where: and(eq(tasks.sessionId, sessionId), isNotNull(tasks.startedAt)),
    columns: { id: true, startedAt: true, estimatedMinutes: true, sessionId: true },
  });
  for (const task of strays) await settleTaskClock(client, task, at);

  if (session.kind === 'group') {
    // Reliability (PRODUCT.md §3.6) for everyone who was ever on the roster.
    const everyone = await client.query.sessionParticipants.findMany({
      where: eq(sessionParticipants.sessionId, sessionId),
      columns: { userId: true },
    });
    for (const p of everyone) await recomputeReliability(client, p.userId);
  }

  if (session.kind === 'group' && present.length >= 2) {
    const anyoneLeft = await client.query.sessionParticipants.findFirst({
      where: and(eq(sessionParticipants.sessionId, sessionId), inArray(sessionParticipants.state, ['left_early', 'no_show'])),
      columns: { userId: true },
    });
    if (!anyoneLeft) {
      for (const participant of present) {
        await awardFlat(client, participant.userId, 'coop_bonus', 'session', sessionId, COOP_SESSION_BONUS);
      }
    }
  }
}

/**
 * Half a credit per minute, up to the daily cap, exactly once per (person,
 * session). The cap is kept on `user_stats` as minutes-credited-today against
 * the local day they were credited on, and rolls over by comparison rather than
 * by a job.
 */
export async function awardUnverifiedMinutes(
  client: Db,
  userId: string,
  sessionId: string,
  minutes: number,
  day: string,
): Promise<number> {
  if (minutes <= 0) return 0;
  const stats = await client.query.userStats.findFirst({
    where: eq(userStats.userId, userId),
    columns: { sessionMinutesToday: true, sessionMinutesDate: true },
  });
  const usedToday = stats?.sessionMinutesDate === day ? stats.sessionMinutesToday : 0;
  const credited = Math.max(0, Math.min(minutes, DAILY_MINUTE_CREDIT_CAP - usedToday));
  const amount = unverifiedCredits(credited);

  const inserted = await client
    .insert(sessionCredits)
    .values({
      id: newId(),
      userId,
      refType: 'session',
      refId: sessionId,
      reason: 'unverified_minutes',
      minutes: credited,
      amount,
    })
    .onConflictDoNothing()
    .returning({ id: sessionCredits.id });
  if (inserted.length === 0) return 0;

  const weekKey = isoWeekKey();
  await client
    .update(userStats)
    .set({
      totalCredits: sql`${userStats.totalCredits} + ${amount}`,
      weeklyCredits: sql`CASE WHEN ${userStats.weekKey} = ${weekKey} THEN ${userStats.weeklyCredits} + ${amount} ELSE ${amount} END`,
      weekKey,
      sessionMinutesToday: sql`CASE WHEN ${userStats.sessionMinutesDate} = ${day} THEN ${userStats.sessionMinutesToday} + ${credited} ELSE ${credited} END`,
      sessionMinutesDate: day,
      updatedAt: nowIso(),
    })
    .where(eq(userStats.userId, userId));
  return amount;
}

/** The other half, when a reviewer confirms the work those minutes went into. Exactly once per task. */
export async function awardVerifiedTopUp(client: Db, userId: string, taskId: string, minutes: number): Promise<number> {
  const amount = verifiedTopUp(minutes);
  if (amount <= 0) return 0;
  return awardFlat(client, userId, 'verified_top_up', 'task', taskId, amount, minutes);
}

async function awardFlat(
  client: Db,
  userId: string,
  reason: string,
  refType: string,
  refId: string,
  amount: number,
  minutes = 0,
): Promise<number> {
  const inserted = await client
    .insert(sessionCredits)
    .values({ id: newId(), userId, refType, refId, reason, minutes, amount })
    .onConflictDoNothing()
    .returning({ id: sessionCredits.id });
  if (inserted.length === 0) return 0;

  const weekKey = isoWeekKey();
  await client
    .update(userStats)
    .set({
      totalCredits: sql`${userStats.totalCredits} + ${amount}`,
      weeklyCredits: sql`CASE WHEN ${userStats.weekKey} = ${weekKey} THEN ${userStats.weeklyCredits} + ${amount} ELSE ${amount} END`,
      weekKey,
      updatedAt: nowIso(),
    })
    .where(eq(userStats.userId, userId));
  return amount;
}

/**
 * The streak (PRODUCT.md §3.6): a day counts once `SESSION_STREAK_MINUTES` were
 * on a clock. One statement, three cases — same day, the day after the last,
 * or a restart — so no read is involved and two sessions ending in the same
 * instant commute.
 */
export async function recordSessionDay(client: Db, userId: string, day: string, minutes: number): Promise<void> {
  if (minutes < SESSION_STREAK_MINUTES) return;
  const previous = previousLocalDate(day);
  const next = sql`CASE
    WHEN ${userStats.lastSessionDate} = ${day} THEN ${userStats.currentStreak}
    WHEN ${userStats.lastSessionDate} = ${previous} THEN ${userStats.currentStreak} + 1
    WHEN EXISTS (
      SELECT 1 FROM rest_days r WHERE r.user_id = ${userId} AND r.date = ${previous}
    ) AND ${userStats.lastSessionDate} IS NOT NULL THEN ${userStats.currentStreak} + 1
    ELSE 1 END`;
  await client
    .update(userStats)
    .set({
      currentStreak: next,
      bestStreak: sql`MAX(${userStats.bestStreak}, ${next})`,
      lastSessionDate: sql`MAX(COALESCE(${userStats.lastSessionDate}, ''), ${day})`,
      updatedAt: nowIso(),
    })
    .where(and(eq(userStats.userId, userId), sql`(${userStats.lastSessionDate} IS NULL OR ${userStats.lastSessionDate} <= ${day})`));
}

/** `YYYY-MM`, the bucket streak freezes replenish in. */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** Freezes left this month, replenishing on the first read of a new month. */
export async function freezesFor(client: Db, userId: string, day: string): Promise<number> {
  const month = monthKey(day);
  await client
    .update(userStats)
    .set({ freezesAvailable: STREAK_FREEZES_PER_MONTH, freezesMonth: month, updatedAt: nowIso() })
    .where(and(eq(userStats.userId, userId), sql`(${userStats.freezesMonth} IS NULL OR ${userStats.freezesMonth} <> ${month})`));
  const stats = await client.query.userStats.findFirst({
    where: eq(userStats.userId, userId),
    columns: { freezesAvailable: true },
  });
  return stats?.freezesAvailable ?? 0;
}

/** Declared rest days in the same ISO week as `date`. */
export async function restDaysInWeek(client: Db, userId: string, date: string): Promise<string[]> {
  const week = isoWeekKey(new Date(`${date}T00:00:00Z`));
  const rows = await client.query.restDays.findMany({
    where: and(eq(restDays.userId, userId), eq(restDays.source, 'declared')),
    columns: { date: true },
  });
  return rows.map((r) => r.date).filter((d) => isoWeekKey(new Date(`${d}T00:00:00Z`)) === week);
}

/** Declares a rest day; `false` when the week's allowance is spent. */
export async function declareRestDay(client: Db, userId: string, date: string): Promise<boolean> {
  const taken = await restDaysInWeek(client, userId, date);
  if (taken.includes(date)) return true;
  if (taken.length >= MAX_REST_DAYS_PER_WEEK) return false;
  await client.insert(restDays).values({ userId, date, source: 'declared' }).onConflictDoNothing();
  return true;
}
