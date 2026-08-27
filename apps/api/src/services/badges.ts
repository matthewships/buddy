import { eq } from 'drizzle-orm';

import { type BadgeKey, earnedBadges } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { userBadges, userStats } from '../db/schema.js';

/**
 * Badge awards (§2.5).
 *
 * Deliberately outside the approval batch. Badges are derived from stats, so
 * they can always be recomputed; contorting the atomic batch to include them
 * would buy nothing. Under a race the worst case is that a badge lands on the
 * next approval instead of this one, which nobody can perceive.
 *
 * Idempotent by the (user_id, badge_key) primary key, so this can run as often
 * as it likes.
 */
export async function syncBadges(db: Db, userId: string): Promise<BadgeKey[]> {
  const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, userId) });
  if (!stats) return [];

  const deserved = earnedBadges({
    totalCredits: stats.totalCredits,
    currentStreak: stats.currentStreak,
    tasksApproved: stats.tasksApproved,
    reviewsGiven: stats.reviewsGiven,
  });
  if (deserved.length === 0) return [];

  const existing = await db.query.userBadges.findMany({
    where: eq(userBadges.userId, userId),
    columns: { badgeKey: true },
  });
  const held = new Set(existing.map((row) => row.badgeKey));
  const fresh = deserved.filter((key) => !held.has(key));
  if (fresh.length === 0) return [];

  await db
    .insert(userBadges)
    .values(fresh.map((badgeKey) => ({ userId, badgeKey })))
    .onConflictDoNothing();

  // Returned so the API can tell the app what to celebrate.
  return fresh;
}
