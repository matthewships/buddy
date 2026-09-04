import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { BADGES, type BadgeKey, reliabilityBand } from '@buddy/shared';

import { db } from '../db/client.js';
import {
  buddyProfiles,
  buddyRequests,
  groupDepartures,
  groupMembers,
  groups,
  userBadges,
  userBlocks,
  userStats,
  users,
} from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { isBlockedPair } from '../services/blocks.js';
import { readTags } from '../services/tags.js';

/**
 * Public profiles (§4.4). Authenticated, because the directory and profiles are
 * only meaningful to signed-in users and this keeps the app's user data off the
 * open internet.
 *
 * The buddy profile is included only when the user is actually open to buddy
 * requests — otherwise headline and about are not public information.
 */
export const userRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/:handle', async (c) => {
    const handle = c.req.param('handle').toLowerCase();
    const client = db(c.env.DB);

    const user = await client.query.users.findFirst({ where: eq(users.handle, handle) });
    if (!user || user.deletedAt !== null) throw notFound('No such user');
    // A blocked pair reads as absence in both directions (PRODUCT.md §6.1). A
    // 404 rather than a 403: "you are blocked" is information the block exists
    // to withhold.
    if (await isBlockedPair(client, currentUserId(c), user.id)) throw notFound('No such user');

    const [stats, badges, profile, tags] = await Promise.all([
      client.query.userStats.findFirst({ where: eq(userStats.userId, user.id) }),
      client.query.userBadges.findMany({ where: eq(userBadges.userId, user.id) }),
      user.isOpenBuddy
        ? client.query.buddyProfiles.findFirst({ where: eq(buddyProfiles.userId, user.id) })
        : Promise.resolve(undefined),
      readTags(client, user.id),
    ]);

    return c.json({
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      goalKey: user.goalKey,
      goalKey2: user.goalKey2,
      goalText: user.goalText,
      occupationKey: user.occupationKey,
      occupationText: user.occupationText,
      // The student profile is public to signed-in users, the same as the goal
      // and occupation lines already were — it is what a prospective buddy
      // reads before deciding to send a request (§2.2).
      educationLevel: user.educationLevel,
      institution: user.institution,
      majorKey: user.majorKey,
      majorText: user.majorText,
      country: user.country,
      city: user.city,
      bio: user.bio,
      topics: tags.topics,
      interests: tags.interests,
      interestText: user.interestText,
      isOpenBuddy: user.isOpenBuddy,
      memberSince: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      stats: {
        totalCredits: stats?.totalCredits ?? 0,
        currentStreak: stats?.currentStreak ?? 0,
        bestStreak: stats?.bestStreak ?? 0,
        tasksApproved: stats?.tasksApproved ?? 0,
        reviewsGiven: stats?.reviewsGiven ?? 0,
        reliability: reliabilityBand(stats?.reliabilityPct ?? null, stats?.reliabilitySessions ?? 0),
        // The exact number only to its owner (PRODUCT.md §5.3).
        reliabilityPct: user.id === currentUserId(c) ? (stats?.reliabilityPct ?? null) : null,
        reliabilitySessions: stats?.reliabilitySessions ?? 0,
      },
      badges: badges.map((b) => describeBadge(b.badgeKey as BadgeKey, b.awardedAt)),
      buddyProfile: profile
        ? {
            headline: profile.headline,
            about: profile.about,
            availability: profile.availability,
            checkinStyle: profile.checkinStyle,
          }
        : null,
    });
  })

  /**
   * Blocking somebody (PRODUCT.md §6.1). Mutual invisibility from here on: the
   * directory, the feed, profiles and chat all read `user_blocks` in both
   * directions. Two things happen at once rather than being left to the next
   * screen: any pending buddy request between the two is expired, and the
   * blocker leaves every matched two-person group they share, because a room
   * of two where one has blocked the other is not a group.
   *
   * Idempotent: blocking twice is one block.
   */
  .post('/:handle/block', async (c) => {
    const handle = c.req.param('handle').toLowerCase();
    const blockerId = currentUserId(c);
    const client = db(c.env.DB);

    const target = await client.query.users.findFirst({
      where: eq(users.handle, handle),
      columns: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) throw notFound('No such user');
    if (target.id === blockerId) throw badRequest('You cannot block yourself');

    await client
      .insert(userBlocks)
      .values({ blockerId, blockedId: target.id })
      .onConflictDoNothing();

    await client
      .update(buddyRequests)
      .set({ status: 'expired', respondedAt: nowIso() })
      .where(
        and(
          eq(buddyRequests.status, 'pending'),
          sql`(${buddyRequests.fromUserId} = ${blockerId} AND ${buddyRequests.toUserId} = ${target.id})
           OR (${buddyRequests.fromUserId} = ${target.id} AND ${buddyRequests.toUserId} = ${blockerId})`,
        ),
      );

    const sharedMatched = await client
      .select({ groupId: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.kind, 'matched'),
          sql`EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = ${groups.id} AND m.user_id = ${blockerId})`,
          sql`EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = ${groups.id} AND m.user_id = ${target.id})`,
        ),
      );
    for (const { groupId } of sharedMatched) {
      // A departure like any other, with the reason the block already is.
      await client.insert(groupDepartures).values({
        id: newId(),
        groupId,
        userId: blockerId,
        reason: 'person',
        note: null,
      });
      await client
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, blockerId)));
      c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(groupId).disconnectMember(blockerId));
    }

    return c.json({ blocked: true as const, leftGroups: sharedMatched.length });
  })

  /** Only the blocker can undo a block, which is why the direction is stored. */
  .delete('/:handle/block', async (c) => {
    const handle = c.req.param('handle').toLowerCase();
    const blockerId = currentUserId(c);
    const client = db(c.env.DB);

    const target = await client.query.users.findFirst({
      where: eq(users.handle, handle),
      columns: { id: true },
    });
    if (!target) throw notFound('No such user');

    await client
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, target.id)));

    return c.json({ blocked: false as const });
  });

/**
 * Joins a stored badge key to its definition. Unknown keys are tolerated rather
 * than thrown: a badge removed from the config should not break a profile that
 * was awarded it.
 */
export function describeBadge(key: BadgeKey, awardedAt: string) {
  const definition = BADGES.find((b) => b.key === key);
  return {
    key,
    name: definition?.name ?? key,
    description: definition?.description ?? '',
    emoji: definition?.emoji ?? '🏅',
    awardedAt,
  };
}
