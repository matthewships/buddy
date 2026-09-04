import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';

import { type BuddySort, buddyDirectoryQuerySchema, isMinor } from '@buddy/shared';

import { db } from '../db/client.js';
import { buddyProfiles, groupMembers, userStats, userTags, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { blockedIdsFor } from '../services/blocks.js';
import { MATCH_SCORE, activeSince, activityLabel } from '../services/matching.js';
import { adultLineCondition } from '../services/safety.js';

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
    const { sort, goal, occupation, level, major, country, topic, sameInstitution, activeOnly, cursor, limit } =
      c.req.valid('query');
    const viewerId = currentUserId(c);
    const client = db(c.env.DB);

    const viewer = await client.query.users.findFirst({
      where: eq(users.id, viewerId),
      columns: {
        goalKey: true,
        goalKey2: true,
        occupationKey: true,
        educationLevel: true,
        majorKey: true,
        country: true,
        institutionNormalised: true,
        dateOfBirth: true,
      },
    });

    // The viewer's own topics, for the `sharedTopic` term below.
    const viewerTopics = (
      await client
        .select({ value: userTags.value })
        .from(userTags)
        .where(and(eq(userTags.userId, viewerId), eq(userTags.kind, 'topic')))
    ).map((row) => row.value);

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

    // Blocks are mutual in effect (PRODUCT.md §6.1): whoever the viewer has
    // blocked, and whoever has blocked the viewer, is simply not here.
    const blockedIds = await blockedIdsFor(client, viewerId);
    const excluded = [...new Set([viewerId, ...mateIds, ...blockedIds])];
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

    /**
     * "Does this person share a topic with me?" — one EXISTS rather than a join,
     * so a buddy with three matching topics still scores `sharedTopic` once. A
     * viewer with no topics contributes a constant false rather than an empty
     * `IN ()`, which SQLite would reject.
     */
    const topicOverlap = viewerTopics.length
      ? sql`EXISTS (
          SELECT 1 FROM ${userTags}
          WHERE ${userTags.userId} = ${users.id}
            AND ${userTags.kind} = 'topic'
            AND ${userTags.value} IN (${sql.join(
              viewerTopics.map((topic) => sql`${topic}`),
              sql`, `,
            )})
        )`
      : sql`0`;

    /** Null never matches null: two users with nothing filled in are not a pair. */
    const sameAs = (column: SQLiteColumn, value: string | null) =>
      value === null ? sql`0` : sql`${column} IS NOT NULL AND ${column} = ${value}`;

    const score = sql<number>`(
      CASE WHEN ${goalOverlap}
           THEN ${MATCH_SCORE.sameGoal} ELSE 0 END
      + CASE WHEN ${sameAs(users.institutionNormalised, viewer?.institutionNormalised ?? null)}
             THEN ${MATCH_SCORE.sameInstitution} ELSE 0 END
      + CASE WHEN ${sameAs(users.majorKey, viewer?.majorKey ?? null)}
             THEN ${MATCH_SCORE.sameMajor} ELSE 0 END
      + CASE WHEN ${sameAs(users.occupationKey, viewer?.occupationKey ?? null)}
             THEN ${MATCH_SCORE.sameOccupation} ELSE 0 END
      + CASE WHEN ${sameAs(users.educationLevel, viewer?.educationLevel ?? null)}
             THEN ${MATCH_SCORE.sameLevel} ELSE 0 END
      + CASE WHEN ${topicOverlap}
             THEN ${MATCH_SCORE.sharedTopic} ELSE 0 END
      + CASE WHEN ${sameAs(users.country, viewer?.country ?? null)}
             THEN ${MATCH_SCORE.sameCountry} ELSE 0 END
      + CASE WHEN ${users.lastSeenAt} IS NOT NULL AND ${users.lastSeenAt} >= ${since}
             THEN ${MATCH_SCORE.activeNow} ELSE 0 END
    )`;

    const conditions = [
      eq(users.isOpenBuddy, true),
      isNull(users.deletedAt),
      // Only fully onboarded users: a card with no goal is useless.
      sql`${users.onboardedAt} IS NOT NULL`,
      notInArray(users.id, excluded),
      // The adult line (PRODUCT.md §6.3): minors see minors, adults see adults.
      adultLineCondition(isMinor(viewer?.dateOfBirth)),
      // A filter on one goal matches a card that carries it in either slot;
      // otherwise a user's second goal would be invisible to the directory.
      ...(goal ? [or(eq(users.goalKey, goal), eq(users.goalKey2, goal))!] : []),
      ...(occupation ? [eq(users.occupationKey, occupation)] : []),
      ...(level ? [eq(users.educationLevel, level)] : []),
      ...(major ? [eq(users.majorKey, major)] : []),
      ...(country ? [eq(users.country, country)] : []),
      ...(topic
        ? [
            sql`EXISTS (
              SELECT 1 FROM ${userTags}
              WHERE ${userTags.userId} = ${users.id}
                AND ${userTags.kind} = 'topic'
                AND ${userTags.value} = ${topic}
            )`,
          ]
        : []),
      /**
       * Institution is free text, so this is the only institution question a
       * filter can ask. It compares the normalised column, exactly as
       * `MATCH_SCORE.sameInstitution` does. A viewer who has not said where
       * they study matches nobody rather than everybody: a constant false,
       * rather than an unconstrained comparison against NULL.
       */
      ...(sameInstitution
        ? [
            viewer?.institutionNormalised
              ? eq(users.institutionNormalised, viewer.institutionNormalised)
              : sql`0`,
          ]
        : []),
      ...(activeOnly ? [sql`${users.lastSeenAt} >= ${since}`] : []),
    ];

    /**
     * Credits, for the "Points" sort. `COALESCE` because the join is a LEFT
     * one: a user whose stats row has not been created yet must sort as zero
     * rather than as NULL, which SQLite orders below every number and would
     * park them at the end of the list forever.
     */
    const points = sql<number>`COALESCE(${userStats.totalCredits}, 0)`;

    /**
     * Keyset cursor: strictly "after" the last row of the previous page, in
     * whichever order that page was built. The sort key differs per sort, so
     * the cursor shape does too — and a cursor minted under one sort is
     * meaningless under the other, which is why it carries its sort and a
     * mismatch restarts from the first page rather than paging through a
     * comparison that means nothing.
     */
    const decoded = cursor ? decodeCursor(cursor, sort) : null;
    if (decoded) {
      conditions.push(
        decoded.sort === 'points'
          ? or(
              sql`${points} < ${decoded.value}`,
              and(sql`${points} = ${decoded.value}`, sql`${users.id} > ${decoded.id}`),
            )!
          : or(
              sql`${score} < ${decoded.value}`,
              and(
                sql`${score} = ${decoded.value}`,
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
        educationLevel: users.educationLevel,
        institution: users.institution,
        majorKey: users.majorKey,
        majorText: users.majorText,
        country: users.country,
        city: users.city,
        interestText: users.interestText,
        lastSeenAt: users.lastSeenAt,
        headline: buddyProfiles.headline,
        totalCredits: userStats.totalCredits,
        currentStreak: userStats.currentStreak,
        reviewsGiven: userStats.reviewsGiven,
        /**
         * The card's chips, aggregated in the query rather than fetched per
         * row: a page of 20 buddies would otherwise be 20 extra round trips.
         * `group_concat` has no ordering guarantee, which is fine — the client
         * renders at most three and the shared list defines their order.
         */
        topics: sql<string | null>`(
          SELECT group_concat(${userTags.value})
          FROM ${userTags}
          WHERE ${userTags.userId} = ${users.id} AND ${userTags.kind} = 'topic'
        )`,
        interests: sql<string | null>`(
          SELECT group_concat(${userTags.value})
          FROM ${userTags}
          WHERE ${userTags.userId} = ${users.id} AND ${userTags.kind} = 'interest'
        )`,
        score,
        points,
      })
      .from(users)
      .leftJoin(buddyProfiles, eq(buddyProfiles.userId, users.id))
      .leftJoin(userStats, eq(userStats.userId, users.id))
      .where(and(...conditions))
      // id ASC is the tiebreak in both orders, matching the cursor comparison.
      .orderBy(
        ...(sort === 'points'
          ? [sql`${points} DESC`, users.id]
          : [sql`${score} DESC`, sql`COALESCE(${users.lastSeenAt}, '') DESC`, users.id]),
      )
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
        educationLevel: row.educationLevel,
        institution: row.institution,
        majorKey: row.majorKey,
        majorText: row.majorText,
        country: row.country,
        city: row.city,
        topics: splitTags(row.topics),
        interests: splitTags(row.interests),
        interestText: row.interestText,
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
              sort,
              value: Number(sort === 'points' ? last.points : last.score),
              lastSeenAt: last.lastSeenAt ?? '',
              id: last.id,
            })
          : null,
    });
  });

/** `group_concat` returns NULL for no rows, and never an empty string. */
function splitTags(value: string | null): string[] {
  return value ? value.split(',') : [];
}

interface Cursor {
  /** Which ordering this position was taken in; see `decodeCursor`. */
  sort: BuddySort;
  /** The sort key's value on the last row of the previous page. */
  value: number;
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

function decodeCursor(value: string, sort: BuddySort): Cursor | null {
  try {
    const parsed = JSON.parse(atob(value)) as Cursor;
    if (typeof parsed.value !== 'number' || typeof parsed.id !== 'string') return null;
    // A cursor from the other ordering encodes a position on a different axis:
    // continuing from it would silently skip or repeat people. Restarting is
    // the honest answer, and it is what flipping the sort control should do.
    if (parsed.sort !== sort) return null;
    return parsed;
  } catch {
    // A malformed cursor restarts from the first page rather than erroring: it
    // is almost always a stale link, not an attack.
    return null;
  }
}
