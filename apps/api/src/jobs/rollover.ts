import { and, eq, lt, sql } from 'drizzle-orm';

import { SESSION_OVERRUN_FACTOR } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { restDays, sessions, tasks, userStats, users } from '../db/schema.js';
import { localDate, nowIso, previousLocalDate } from '../lib/time.js';
import { awardApproval } from '../services/credits.js';
import { endSession, freezesFor } from '../services/sessions.js';

/**
 * The hourly day-rollover job (§4.9).
 *
 * Written to be **idempotent rather than scheduled-exact**: it does not check
 * "is it midnight in this timezone". It marks any `planned` task whose local day
 * has already passed as `missed`, which only becomes true after local midnight,
 * is harmless to re-run, and self-heals if a cron firing is missed entirely.
 * Matching on the hour would silently skip a whole day's rollover for every user
 * in a timezone whose one firing was dropped.
 *
 * Timezones are grouped so the work is one statement per distinct timezone in
 * use, not one per user.
 */
export interface RolloverResult {
  timezones: number;
  missed: number;
  streaksReset: number;
  /** Tasks closed because nobody ever reviewed them — see `closeUnreviewed`. */
  closedUnreviewed: number;
}

export async function runRollover(db: Db, now: Date = new Date()): Promise<RolloverResult> {
  const zones = await db
    .selectDistinct({ timezone: users.timezone })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`);

  let missed = 0;

  for (const { timezone } of zones) {
    let today: string;
    try {
      today = localDate(timezone, now);
    } catch {
      // A row with a timezone the runtime doesn't know must not stop the job for
      // everyone else.
      console.error(`[rollover] unknown timezone ${timezone}`);
      continue;
    }

    const result = await db
      .update(tasks)
      // Stops the clock too. A task that ran past its own day keeps the owner
      // locked out of chat otherwise — and no penalty is charged, because the
      // day ending is not the same as walking away from a commitment. Charging
      // someone who is asleep would be indefensible.
      .set({ status: 'missed', startedAt: null })
      .where(
        and(
          eq(tasks.status, 'planned'),
          lt(tasks.dueDate, today),
          sql`${tasks.userId} IN (SELECT id FROM users WHERE timezone = ${timezone} AND deleted_at IS NULL)`,
        ),
      )
      .returning({ id: tasks.id });

    missed += result.length;
  }

  // Before the streak check, so a session that ran overnight is settled —
  // and its day recorded — before the day is judged.
  await endStaleSessions(db, now);

  const closedUnreviewed = await closeUnreviewed(db, now);
  const streaksReset = await resetLapsedStreaks(db, now);

  return { timezones: zones.length, missed, streaksReset, closedUnreviewed };
}

/**
 * A live session left running well past its plan is ended by the clock, not
 * by a person (PRODUCT.md §3.1). The margin is the overrun the minutes are
 * capped at anyway plus an hour, so nobody mid-session is cut off; what this
 * catches is a laptop closed on a running clock.
 */
export async function endStaleSessions(db: Db, now: Date): Promise<number> {
  const live = await db.query.sessions.findMany({
    where: eq(sessions.state, 'live'),
    columns: { id: true, startedAt: true, plannedMinutes: true },
  });
  let ended = 0;
  for (const session of live) {
    if (!session.startedAt) continue;
    const limitMs = (session.plannedMinutes * SESSION_OVERRUN_FACTOR + 60) * 60_000;
    if (now.getTime() - Date.parse(session.startedAt) < limitMs) continue;
    await endSession(db, session.id, now.toISOString());
    ended += 1;
  }
  return ended;
}

/**
 * Closes tasks that were marked `done` and then never reviewed.
 *
 * Without this they are a dead end. The `planned` sweep above does not touch
 * them, so a `done` task with no reviewer stays `done` for ever: it earns
 * nothing, never closes, and because a streak counts *approved* days, it breaks
 * the owner's streak. That punishes the person who did the work and kept their
 * word for their reviewer's silence — which in a two-person group is most
 * weekends, and is the exact opposite of what the product is for.
 *
 * Closed at rating 0, which §2.4 already defines as an approval that earns no
 * credits: the day counts, the streak survives, and nobody is paid for work
 * nobody checked. No `task_reviews` row is written, because none happened —
 * `reviewer_id` is NOT NULL, and inventing a reviewer to satisfy it would put a
 * lie in the audit trail.
 *
 * The wait is a full extra day, not one midnight. A task marked done at 11pm
 * gets the whole of the next day for a reviewer to see it, so this only ever
 * fires on tasks that were genuinely abandoned rather than merely overnight.
 */
async function closeUnreviewed(db: Db, now: Date): Promise<number> {
  const zones = await db
    .selectDistinct({ timezone: users.timezone })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`);

  let closed = 0;

  for (const { timezone } of zones) {
    let cutoff: string;
    try {
      cutoff = previousLocalDate(localDate(timezone, now));
    } catch {
      console.error(`[rollover] unknown timezone ${timezone}`);
      continue;
    }

    /**
     * Claimed with a guarded UPDATE for the same reason the review route uses
     * one: a reviewer approving at the moment this runs must not produce two
     * awards for one task. Whichever writes first wins, and the other sees no
     * row.
     */
    const swept = await db
      .update(tasks)
      .set({ status: 'approved', startedAt: null })
      .where(
        and(
          eq(tasks.status, 'done'),
          lt(tasks.dueDate, cutoff),
          sql`${tasks.userId} IN (SELECT id FROM users WHERE timezone = ${timezone} AND deleted_at IS NULL)`,
        ),
      )
      .returning({ id: tasks.id, userId: tasks.userId, dueDate: tasks.dueDate });

    for (const task of swept) {
      await awardApproval(db, {
        ownerId: task.userId,
        reviewerId: null,
        taskId: task.id,
        dueDate: task.dueDate,
        rating: 0,
      });
    }

    closed += swept.length;
  }

  return closed;
}

/**
 * Breaks the streak of anyone whose last session day is now more than one day
 * behind their own local yesterday — unless yesterday was a rest day they
 * declared, or they have a freeze left this month, in which case the freeze
 * is spent for them and yesterday becomes a rest day (PRODUCT.md §3.6).
 *
 * Streaks are *extended* when a session ends (services/sessions.ts); only
 * breaking one needs a clock. The comparison is against the user's local
 * yesterday, so someone whose day is still in progress is never judged early.
 */
async function resetLapsedStreaks(db: Db, now: Date): Promise<number> {
  const zones = await db
    .selectDistinct({ timezone: users.timezone })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`);

  let reset = 0;

  for (const { timezone } of zones) {
    let yesterday: string;
    try {
      yesterday = previousLocalDate(localDate(timezone, now));
    } catch {
      continue;
    }

    const lapsed = await db
      .select({ userId: userStats.userId })
      .from(userStats)
      .where(
        and(
          sql`${userStats.currentStreak} > 0`,
          // No session yesterday or today, so the chain would break here.
          sql`(${userStats.lastSessionDate} IS NULL OR ${userStats.lastSessionDate} < ${yesterday})`,
          // ...unless yesterday was already excused.
          sql`NOT EXISTS (SELECT 1 FROM ${restDays} WHERE ${restDays.userId} = ${userStats.userId} AND ${restDays.date} = ${yesterday})`,
          sql`${userStats.userId} IN (SELECT id FROM users WHERE timezone = ${timezone} AND deleted_at IS NULL)`,
        ),
      );

    for (const { userId } of lapsed) {
      const freezes = await freezesFor(db, userId, yesterday);
      if (freezes > 0) {
        // Spent on their behalf: the chain holds, and the day is written down
        // as excused so the next firing does not spend another.
        await db.batch([
          db.insert(restDays).values({ userId, date: yesterday, source: 'freeze' }).onConflictDoNothing(),
          db
            .update(userStats)
            .set({ freezesAvailable: sql`MAX(0, ${userStats.freezesAvailable} - 1)`, updatedAt: nowIso() })
            .where(eq(userStats.userId, userId)),
        ]);
        continue;
      }
      await db
        .update(userStats)
        .set({ currentStreak: 0, updatedAt: nowIso() })
        .where(and(eq(userStats.userId, userId), sql`${userStats.currentStreak} > 0`));
      reset += 1;
    }
  }

  return reset;
}
