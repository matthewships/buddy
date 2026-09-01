import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { BADGES, type BadgeKey } from '@buddy/shared';

import { db } from '../db/client.js';
import { buddyProfiles, userBadges, userStats, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
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
