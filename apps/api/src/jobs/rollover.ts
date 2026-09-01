import { and, eq, lt, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { tasks, userStats, users } from '../db/schema.js';
import { localDate, nowIso, previousLocalDate } from '../lib/time.js';
import { awardApproval } from '../services/credits.js';

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

  const closedUnreviewed = await closeUnreviewed(db, now);
  // After the closures, so a task closed on this run still counts as an
  // approval for its own day and cannot break the streak it just earned.
  const streaksReset = await resetLapsedStreaks(db, now);

  return { timezones: zones.length, missed, streaksReset, closedUnreviewed };
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
 * Zeroes the streak of anyone whose last approved day is now more than one day
 * behind their own local yesterday.
 *
 * Streaks are *extended* at approval time (services/credits.ts); only breaking
 * one needs a clock, because nothing happens when a user simply stops. The
 * comparison is against their local yesterday, so someone whose day is still in
 * progress is never punished early.
 *
 * Anyone with work still waiting on a reviewer is held rather than broken.
 * `closeUnreviewed` deliberately gives a reviewer a full extra day, which means
 * an approval can arrive up to two days after the day it belongs to — and
 * without this the streak would be zeroed in the gap, every time, for the one
 * user who did everything right. Their chain is not broken; it is unconfirmed,
 * and those are different. Only `done` counts: a task sent back for more proof
 * is waiting on its owner, not on anybody else.
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

    const result = await db
      .update(userStats)
      .set({ currentStreak: 0, updatedAt: nowIso() })
      .where(
        and(
          sql`${userStats.currentStreak} > 0`,
          // Nothing approved yesterday or today, so the chain is broken.
          sql`(${userStats.lastApprovedDate} IS NULL OR ${userStats.lastApprovedDate} < ${yesterday})`,
          // ...unless they are waiting on somebody else to look at it.
          sql`NOT EXISTS (SELECT 1 FROM tasks WHERE tasks.user_id = ${userStats.userId} AND tasks.status = 'done')`,
          sql`${userStats.userId} IN (SELECT id FROM users WHERE timezone = ${timezone} AND deleted_at IS NULL)`,
        ),
      )
      .returning({ userId: userStats.userId });

    reset += result.length;
  }

  return reset;
}
