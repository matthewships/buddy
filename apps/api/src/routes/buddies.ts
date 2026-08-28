import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { buddyDirectoryQuerySchema } from '@buddy/shared';

import { db } from '../db/client.js';
import { buddyProfiles, groupMembers, userStats, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { MATCH_SCORE, activeSince, activityLabel } from '../services/matching.js';

/**
 * The buddy directory (§2.2) — for users who know nobody.
 *
 * Excluded from the results: the caller, anyone not open to requests, deleted
 * accounts, and anyone already sharing a group with the caller (there is no
 * point matching with someone you're already paired to).
 *
 * Paging is keyset, not OFFSET: the sort key is (score, last_seen_at, id) and
 * the cursor carries all three. OFFSET would skip or repeat rows as people's
 * activity changes between pages, which on a directory sorted by recency happens
 * constantly.
 */
export const buddyRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', zValidator('query', buddyDirectoryQuerySchema), async (c) => {
    const { goal, occupation, activeOnly, cursor, limit } = c.req.valid('query');
    const viewerId = currentUserId(c);
    const client = db(c.env.DB);

    const viewer = await client.query.users.findFirst({
      where: eq(users.id, viewerId),
      columns: { goalKey: true, goalKey2: true, occupationKey: true },
    });

    // Group-mates are excluded, so find the caller's groups first.
    const myGroups = await client
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, viewerId));

    const mateIds = myGroups.length
      ? (
          await client
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(
              inArray(
                groupMembers.groupId,
                myGroups.map((g) => g.groupId),
              ),
            )
        ).map((row) => row.userId)
      : [];

    const excluded = [...new Set([viewerId, ...mateIds])];
    const since = activeSince();

    // The match score, mirroring §2.2's ordering rules.
    //
    // "Same goal" is now an overlap test between two pairs rather than an
    // equality test between two values (§2.1, MAX_GOALS = 2). It stays worth
    // sameGoal once, not twice: sharing both goals is not twice as good a match
    // as sharing one, and doubling it would outrank an active buddy purely on a
    // second-goal coincidence.
    const viewerGoals = [viewer?.goalKey ?? null, viewer?.goalKey2 ?? null];
    const goalOverlap = sql`(
      (${users.goalKey} IS NOT NULL AND ${users.goalKey} IN (${viewerGoals[0]}, ${viewerGoals[1]}))
      OR (${users.goalKey2} IS NOT NULL AND ${users.goalKey2} IN (${viewerGoals[0]}, ${viewerGoals[1]}))
    )`;

    const score = sql<number>`(
      CASE WHEN ${goalOverlap}
           THEN ${MATCH_SCORE.sameGoal} ELSE 0 END
      + CASE WHEN ${users.occupationKey} IS NOT NULL AND ${users.occupationKey} = ${viewer?.occupationKey ?? null}
             THEN ${MATCH_SCORE.sameOccupation} ELSE 0 END
      + CASE WHEN ${users.lastSeenAt} IS NOT NULL AND ${users.lastSeenAt} >= ${since}
             THEN ${MATCH_SCORE.activeNow} ELSE 0 END
    )`;

    const conditions = [
      eq(users.isOpenBuddy, true),
      isNull(users.deletedAt),
      // Only fully onboarded users: a card with no goal is useless.
      sql`${users.onboardedAt} IS NOT NULL`,
      notInArray(users.id, excluded),
      // A filter on one goal matches a card that carries it in either slot;
      // otherwise a user's second goal would be invisible to the directory.
      ...(goal ? [or(eq(users.goalKey, goal), eq(users.goalKey2, goal))!] : []),
      ...(occupation ? [eq(users.occupationKey, occupation)] : []),
      ...(activeOnly ? [sql`${users.lastSeenAt} >= ${since}`] : []),
    ];

    // Keyset cursor: strictly "after" the last row in the previous page.
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (decoded) {
      conditions.push(
        or(
          sql`${score} < ${decoded.score}`,
          and(
            sql`${score} = ${decoded.score}`,
            or(
              sql`COALESCE(${users.lastSeenAt}, '') < ${decoded.lastSeenAt}`,
              and(
                sql`COALESCE(${users.lastSeenAt}, '') = ${decoded.lastSeenAt}`,
                sql`${users.id} > ${decoded.id}`,
              ),
            ),
          ),
        )!,
      );
    }

    const rows = await client
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
        goalKey: users.goalKey,
        goalKey2: users.goalKey2,
        goalText: users.goalText,
        occupationKey: users.occupationKey,
        occupationText: users.occupationText,
        lastSeenAt: users.lastSeenAt,
        headline: buddyProfiles.headline,
        totalCredits: userStats.totalCredits,
        currentStreak: userStats.currentStreak,
        reviewsGiven: userStats.reviewsGiven,
        score,
      })
      .from(users)
      .leftJoin(buddyProfiles, eq(buddyProfiles.userId, users.id))
      .leftJoin(userStats, eq(userStats.userId, users.id))
      .where(and(...conditions))
      // id ASC is the tiebreak, matching the cursor comparison above.
      .orderBy(sql`${score} DESC`, sql`COALESCE(${users.lastSeenAt}, '') DESC`, users.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return c.json({
      buddies: page.map((row) => ({
        id: row.id,
        handle: row.handle,
        displayName: row.displayName,
        avatarKey: row.avatarKey,
        goalKey: row.goalKey,
        goalKey2: row.goalKey2,
        goalText: row.goalText,
        occupationKey: row.occupationKey,
        occupationText: row.occupationText,
        headline: row.headline,
        activity: activityLabel(row.lastSeenAt),
        stats: {
          totalCredits: row.totalCredits ?? 0,
          currentStreak: row.currentStreak ?? 0,
          reviewsGiven: row.reviewsGiven ?? 0,
        },
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              score: Number(last.score),
              lastSeenAt: last.lastSeenAt ?? '',
              id: last.id,
            })
          : null,
    });
  });

interface Cursor {
  score: number;
  lastSeenAt: string;
  id: string;
}

/**
 * Cursors are opaque to the client but not secret — they only encode a position
 * in a public listing, so base64 of JSON is enough and keeps them debuggable.
 */
function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor));
}

function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(atob(value)) as Cursor;
    if (typeof parsed.score !== 'number' || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    // A malformed cursor restarts from the first page rather than erroring: it
    // is almost always a stale link, not an attack.
    return null;
  }
}
