import { and, eq, lt, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { tasks, userStats, users } from '../db/schema.js';
import { localDate, nowIso, previousLocalDate } from '../lib/time.js';

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
      .set({ status: 'missed' })
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

  const streaksReset = await resetLapsedStreaks(db, now);

  return { timezones: zones.length, missed, streaksReset };
}

/**
 * Zeroes the streak of anyone whose last approved day is now more than one day
 * behind their own local yesterday.
 *
 * Streaks are *extended* at approval time (services/credits.ts); only breaking
 * one needs a clock, because nothing happens when a user simply stops. The
 * comparison is against their local yesterday, so someone whose day is still in
 * progress is never punished early.
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
          sql`${userStats.userId} IN (SELECT id FROM users WHERE timezone = ${timezone} AND deleted_at IS NULL)`,
        ),
      )
      .returning({ userId: userStats.userId });

    reset += result.length;
  }

  return reset;
}
