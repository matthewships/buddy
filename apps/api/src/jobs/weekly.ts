import { ne, or, isNull } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { userStats } from '../db/schema.js';
import { isoWeekKey, nowIso } from '../lib/time.js';
import { refreshSnapshot } from '../services/leaderboard.js';

/**
 * The Monday leaderboard rollover (§4.9).
 *
 * Order matters: the week that just ended is frozen into KV *before* anything is
 * reset, or the frozen snapshot would be of an already-cleared board.
 *
 * The reset itself only has to stamp `week_key`. Weekly credits are compared
 * against the current week wherever they are read, and services/credits.ts folds
 * the reset into its own UPDATE, so a stale key already behaves as zero — this
 * job makes that explicit rather than relying on it.
 */
export interface WeeklyResult {
  frozenWeek: string;
  rowsCleared: number;
}

export async function runWeekly(
  db: Db,
  kv: KVNamespace,
  now: Date = new Date(),
): Promise<WeeklyResult> {
  const currentWeek = isoWeekKey(now);
  // The job runs just after midnight Monday, so "yesterday" is in the week that
  // just closed.
  const previousWeek = isoWeekKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  // Freeze first. All-time is refreshed at the same time since it is cheap and
  // this is the one moment the board is guaranteed to be looked at.
  await refreshSnapshot(db, kv, 'weekly');
  await refreshSnapshot(db, kv, 'alltime');

  const cleared = await db
    .update(userStats)
    .set({ weeklyCredits: 0, weekKey: currentWeek, updatedAt: nowIso() })
    .where(or(isNull(userStats.weekKey), ne(userStats.weekKey, currentWeek)))
    .returning({ userId: userStats.userId });

  return { frozenWeek: previousWeek, rowsCleared: cleared.length };
}
