import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { MAX_PAGE_SIZE, type LeaderboardScope } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { groupMembers, userStats, users } from '../db/schema.js';
import { isoWeekKey } from '../lib/time.js';

/**
 * Leaderboards (§2.5, §4.9).
 *
 * Reads come from a KV snapshot refreshed at most every 5 minutes, because the
 * board is read-heavy, changes slowly, and does not need to be exact — nobody
 * can tell a 3-minute-old ranking from a live one. The snapshot is
 * stale-while-revalidate: a stale read is served immediately and the refresh
 * happens after the response, so a cold or expired key never makes a user wait.
 *
 * A user's *own* rank is computed live against D1, because that is the one
 * number they will notice being wrong.
 */

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_SIZE = 100;

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  credits: number;
  currentStreak: number;
}

interface Snapshot {
  scope: LeaderboardScope;
  weekKey: string | null;
  generatedAt: string;
  entries: LeaderboardEntry[];
}

function keyFor(scope: LeaderboardScope): string {
  return scope === 'weekly' ? `leaderboard:weekly:${isoWeekKey()}` : 'leaderboard:alltime';
}

/** Reads the top N straight from D1. */
async function computeSnapshot(db: Db, scope: LeaderboardScope): Promise<Snapshot> {
  const weekKey = isoWeekKey();
  const creditColumn = scope === 'weekly' ? userStats.weeklyCredits : userStats.totalCredits;

  const rows = await db
    .select({
      userId: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
      credits: creditColumn,
      currentStreak: userStats.currentStreak,
    })
    .from(userStats)
    .innerJoin(users, eq(users.id, userStats.userId))
    .where(
      and(
        isNull(users.deletedAt),
        gt(creditColumn, 0),
        // A stale week_key means those weekly credits belong to a past week.
        ...(scope === 'weekly' ? [eq(userStats.weekKey, weekKey)] : []),
      ),
    )
    .orderBy(desc(creditColumn), users.id)
    .limit(SNAPSHOT_SIZE);

  return {
    scope,
    weekKey: scope === 'weekly' ? weekKey : null,
    generatedAt: new Date().toISOString(),
    entries: rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      handle: row.handle,
      displayName: row.displayName,
      avatarKey: row.avatarKey,
      credits: row.credits ?? 0,
      currentStreak: row.currentStreak ?? 0,
    })),
  };
}

export interface LeaderboardRead {
  entries: LeaderboardEntry[];
  generatedAt: string;
  /** True when the caller was served a snapshot that is being refreshed behind them. */
  stale: boolean;
}

/**
 * Serves the board. `revalidate` receives a promise the caller should hand to
 * `waitUntil`, so the refresh does not delay the response.
 */
export async function readLeaderboard(
  db: Db,
  kv: KVNamespace,
  scope: LeaderboardScope,
  revalidate: (work: Promise<unknown>) => void,
): Promise<LeaderboardRead> {
  const key = keyFor(scope);
  const cached = await kv.get<Snapshot>(key, 'json');

  if (cached) {
    const age = Date.now() - Date.parse(cached.generatedAt);
    const stale = age > SNAPSHOT_TTL_MS;
    if (stale) {
      revalidate(refreshSnapshot(db, kv, scope));
    }
    return { entries: cached.entries, generatedAt: cached.generatedAt, stale };
  }

  // Cold key: compute inline, since there is nothing to serve otherwise.
  const snapshot = await computeSnapshot(db, scope);
  revalidate(kv.put(key, JSON.stringify(snapshot), { expirationTtl: 60 * 60 * 24 * 30 }));
  return { entries: snapshot.entries, generatedAt: snapshot.generatedAt, stale: false };
}

export async function refreshSnapshot(
  db: Db,
  kv: KVNamespace,
  scope: LeaderboardScope,
): Promise<void> {
  const snapshot = await computeSnapshot(db, scope);
  await kv.put(keyFor(scope), JSON.stringify(snapshot), {
    // Weekly snapshots are kept a month so a frozen week can still be read.
    expirationTtl: 60 * 60 * 24 * 30,
  });
}

/**
 * The caller's own rank, computed live: "how many people are ahead of me".
 *
 * Deliberately not read from the snapshot — the snapshot only holds the top 100,
 * and a user outside it would otherwise be told they have no rank at all.
 */
export async function myRank(
  db: Db,
  userId: string,
  scope: LeaderboardScope,
): Promise<{ rank: number | null; credits: number }> {
  const weekKey = isoWeekKey();
  const creditColumn = scope === 'weekly' ? userStats.weeklyCredits : userStats.totalCredits;

  const mine = await db.query.userStats.findFirst({ where: eq(userStats.userId, userId) });
  if (!mine) return { rank: null, credits: 0 };

  const credits =
    scope === 'weekly'
      ? mine.weekKey === weekKey
        ? mine.weeklyCredits
        : 0
      : mine.totalCredits;

  if (credits <= 0) return { rank: null, credits: 0 };

  const [ahead] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userStats)
    .innerJoin(users, eq(users.id, userStats.userId))
    .where(
      and(
        isNull(users.deletedAt),
        gt(creditColumn, credits),
        ...(scope === 'weekly' ? [eq(userStats.weekKey, weekKey)] : []),
      ),
    );

  return { rank: Number(ahead?.count ?? 0) + 1, credits };
}

/**
 * One group's standings, computed live.
 *
 * No KV snapshot, unlike the global board: a group is a handful of rows, the
 * query is bounded by its membership, and a stale group board is far more
 * noticeable than a stale global one — you know these people, and you know
 * whether the task you just got approved has landed.
 *
 * Two deliberate differences from the global board:
 *
 * **Everybody appears, including on zero.** The global board filters to
 * `credits > 0` because listing thousands of empty rows is noise. Here the
 * empty row is the point — a group of four should show four people, and the
 * member who has not started yet is exactly who the list is talking to.
 *
 * **Equal credits share a rank.** With a hundred strangers an arbitrary
 * tie-break is invisible. With three people on nothing, telling one of them
 * they are third is a fabrication about people who can see each other.
 */
export async function groupLeaderboard(
  db: Db,
  groupId: string,
  scope: LeaderboardScope,
): Promise<LeaderboardEntry[]> {
  const weekKey = isoWeekKey();

  /**
   * Credits as this board counts them, as one SQL expression so the ordering
   * and the displayed number are the same value.
   *
   * Two things collapse into it. `COALESCE` covers the missing stats row of a
   * member who has never been approved, and the weekly `CASE` applies the same
   * staleness rule the global board applies in its WHERE: a weekly figure
   * carrying a past week's key belongs to that week, not this one. Zeroing that
   * in JavaScript after the query would have ordered the list by a number it
   * then refused to show.
   */
  const credits =
    scope === 'weekly'
      ? sql<number>`CASE WHEN ${userStats.weekKey} = ${weekKey} THEN COALESCE(${userStats.weeklyCredits}, 0) ELSE 0 END`
      : sql<number>`COALESCE(${userStats.totalCredits}, 0)`;

  const rows = await db
    .select({
      userId: users.id,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
      credits,
      currentStreak: sql<number>`COALESCE(${userStats.currentStreak}, 0)`,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    // Left, because a member who has never had a task approved has no stats row
    // at all, and dropping them would quietly shrink the group.
    .leftJoin(userStats, eq(userStats.userId, users.id))
    .where(and(eq(groupMembers.groupId, groupId), isNull(users.deletedAt)))
    .orderBy(desc(credits), desc(userStats.currentStreak), groupMembers.joinedAt);

  let rank = 0;
  let previous: number | null = null;

  return rows.map((row, index) => {
    const earned = Number(row.credits);
    if (earned !== previous) {
      rank = index + 1;
      previous = earned;
    }

    return {
      rank,
      userId: row.userId,
      handle: row.handle,
      displayName: row.displayName,
      avatarKey: row.avatarKey,
      credits: earned,
      currentStreak: Number(row.currentStreak),
    };
  });
}

export { MAX_PAGE_SIZE };
