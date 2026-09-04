import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  LATE_AFTER_MINUTES,
  MAX_BUDDY_NUDGES_PER_DAY,
  MAX_CHECKINS_PER_DAY,
  RELIABILITY_WINDOW,
  nudgeText,
} from '@buddy/shared';

import type { Db } from '../db/client.js';
import { nudges, sessionParticipants, sessions, userStats, users } from '../db/schema.js';
import type { Env } from '../env.js';
import { newId } from '../lib/ids.js';
import { localDateOrUtc, localDayEnd, localTimeToInstant, nowIso } from '../lib/time.js';
import { enqueuePush } from './push.js';

/**
 * Pressure (PRODUCT.md §3.3, slice 2).
 *
 * Everything here hangs off one derived number: the **latest start**. A task
 * carries the time it needs and the day ends at the owner's midnight, so the
 * moment after which the task cannot be finished today is arithmetic, not a
 * question. That number turns "not started" from a state into a countdown,
 * and it is the trigger the system nudge fires on.
 *
 * Every nudge — the system's, a groupmate's, a check-in the owner asked for —
 * is one row in `nudges`, against the recipient's local day, so the budget
 * that keeps the pressure healthy is one count.
 */

/** The instant a task must be started by to finish today, or null when it has no estimate. */
export function latestStart(
  task: { dueDate: string; estimatedMinutes: number | null; startBy: string | null },
  timezone: string,
): string | null {
  if (task.estimatedMinutes === null) return null;
  let derived: Date;
  try {
    derived = new Date(localDayEnd(timezone, task.dueDate).getTime() - task.estimatedMinutes * 60_000);
  } catch {
    return null;
  }
  if (task.startBy) {
    try {
      const own = localTimeToInstant(timezone, task.dueDate, task.startBy);
      // The owner may only bring it forward; the arithmetic is the ceiling.
      if (own.getTime() < derived.getTime()) return own.toISOString();
    } catch {
      // An unparseable override is ignored rather than trusted.
    }
  }
  return derived.toISOString();
}

/** How many nudges of a kind somebody has received today, their day. */
export async function nudgesReceivedToday(client: Db, userId: string, day: string, kinds: string[]): Promise<number> {
  const [row] = await client
    .select({ n: sql<number>`count(*)` })
    .from(nudges)
    .where(and(eq(nudges.toUserId, userId), eq(nudges.day, day), inArray(nudges.kind, kinds)));
  return Number(row?.n ?? 0);
}

export async function localDayFor(client: Db, userId: string, at: Date = new Date()): Promise<string> {
  const user = await client.query.users.findFirst({ where: eq(users.id, userId), columns: { timezone: true } });
  return localDateOrUtc(user?.timezone ?? 'UTC', at);
}

/**
 * A groupmate's nudge to somebody who has not started (PRODUCT.md §3.3):
 * templated, one per sender per target per day per task, and inside the
 * recipient's daily budget. Returns the row, or the reason it was refused.
 */
export async function sendBuddyNudge(
  client: Db,
  env: Env,
  input: {
    fromUserId: string;
    fromName: string;
    toUserId: string;
    template: string;
    taskId?: string;
    sessionId?: string;
    groupId: string;
    title?: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const day = await localDayFor(client, input.toUserId);

  const duplicate = await client.query.nudges.findFirst({
    where: and(
      eq(nudges.kind, 'buddy'),
      eq(nudges.fromUserId, input.fromUserId),
      eq(nudges.toUserId, input.toUserId),
      eq(nudges.day, day),
      input.taskId ? eq(nudges.taskId, input.taskId) : eq(nudges.sessionId, input.sessionId ?? ''),
    ),
    columns: { id: true },
  });
  if (duplicate) return { ok: false, reason: 'You already nudged them about this today' };

  const received = await nudgesReceivedToday(client, input.toUserId, day, ['buddy']);
  if (received >= MAX_BUDDY_NUDGES_PER_DAY) {
    return { ok: false, reason: 'They have had enough nudges for one day' };
  }

  const id = newId();
  await client.insert(nudges).values({
    id,
    kind: 'buddy',
    taskId: input.taskId ?? null,
    sessionId: input.sessionId ?? null,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    template: input.template,
    day,
    sentAt: nowIso(),
  });

  await enqueuePush(env, {
    userIds: [input.toUserId],
    title: `${input.fromName}: ${nudgeText(input.template)}`,
    body: input.title ?? 'Your group is waiting.',
    data: { type: 'buddy_nudge', nudgeId: id, groupId: input.groupId, url: `/groups/${input.groupId}` },
  });
  return { ok: true, id };
}

/** The owner asks a buddy to check on them at a time (PRODUCT.md §3.3). Opt-in by construction. */
export async function requestCheckin(
  client: Db,
  input: { ownerId: string; buddyUserId: string; taskId: string; at: string },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const day = await localDayFor(client, input.ownerId);
  const asked = await nudgesReceivedToday(client, input.ownerId, day, ['checkin']);
  if (asked >= MAX_CHECKINS_PER_DAY) return { ok: false, reason: `${MAX_CHECKINS_PER_DAY} check-ins a day is the limit` };

  const id = newId();
  await client.insert(nudges).values({
    id,
    kind: 'checkin',
    taskId: input.taskId,
    // The *owner* is the recipient of the eventual reply, and the one whose
    // budget this counts against; the buddy is who is asked.
    fromUserId: input.buddyUserId,
    toUserId: input.ownerId,
    day,
    scheduledFor: input.at,
  });
  return { ok: true, id };
}

/**
 * Reliability (PRODUCT.md §3.6): the share of the last `RELIABILITY_WINDOW`
 * committed group sessions somebody attended on time. Recomputed for each
 * participant when a group session ends. A session left early still counts as
 * attended — the promise was to show up — and a no-show does not.
 */
export async function recomputeReliability(client: Db, userId: string): Promise<void> {
  const rows = await client
    .select({ state: sessionParticipants.state, onTime: sessionParticipants.onTime })
    .from(sessionParticipants)
    .innerJoin(sessions, eq(sessions.id, sessionParticipants.sessionId))
    .where(
      and(
        eq(sessionParticipants.userId, userId),
        eq(sessions.kind, 'group'),
        eq(sessions.state, 'ended'),
        inArray(sessionParticipants.state, ['completed', 'left_early', 'no_show', 'late']),
      ),
    )
    .orderBy(desc(sessions.endedAt))
    .limit(RELIABILITY_WINDOW);

  const total = rows.length;
  const onTime = rows.filter((r) => r.onTime === 1 && r.state !== 'no_show').length;
  await client
    .update(userStats)
    .set({
      reliabilityPct: total === 0 ? null : Math.round((onTime / total) * 100),
      reliabilitySessions: total,
      updatedAt: nowIso(),
    })
    .where(eq(userStats.userId, userId));
}

/** Whether a join at `at` counts as on time for a session started at `startedAt`. */
export function joinedOnTime(startedAt: string | null, at: string): number {
  if (!startedAt) return 1;
  return Date.parse(at) - Date.parse(startedAt) <= LATE_AFTER_MINUTES * 60_000 ? 1 : 0;
}

/** Nudge rows for one task, newest first, with the sender's name. */
export async function nudgesForTask(client: Db, taskId: string) {
  return client
    .select({
      id: nudges.id,
      kind: nudges.kind,
      template: nudges.template,
      fromUserId: nudges.fromUserId,
      toUserId: nudges.toUserId,
      scheduledFor: nudges.scheduledFor,
      sentAt: nudges.sentAt,
      createdAt: nudges.createdAt,
      fromDisplayName: users.displayName,
    })
    .from(nudges)
    .leftJoin(users, eq(users.id, nudges.fromUserId))
    .where(eq(nudges.taskId, taskId))
    .orderBy(desc(nudges.createdAt));
}
