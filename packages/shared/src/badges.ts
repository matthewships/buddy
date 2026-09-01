/**
 * Badge definitions (§2.5). These are configuration, not a database table —
 * `user_badges` only records which key was awarded and when, so adding a badge
 * here makes it awardable without a migration.
 *
 * The set is built as **ladders**, not a scatter of one-off awards, which is
 * what the learning and community apps worth copying converged on: one ladder
 * per thing the app actually measures, a handful of rungs each, and the next
 * rung always visible with your distance to it. A single unreachable award
 * tells a new user nothing; a ladder whose first rung is one task away tells
 * them what to do this afternoon. Every rung is spelled out below rather than
 * generated from a threshold list, so each one can be named by hand.
 */

/** The four things `user_stats` actually counts, one ladder each. */
export type BadgeFamily = 'tasks' | 'points' | 'streak' | 'reviews';

export type BadgeKind =
  | { type: 'credits'; threshold: number }
  | { type: 'streak'; days: number }
  | { type: 'tasks_approved'; count: number }
  | { type: 'reviews_given'; count: number };

export interface Badge {
  key: string;
  name: string;
  description: string;
  emoji: string;
  family: BadgeFamily;
  /** Rung on its ladder, 1-based. Used for ordering and wording, nothing else. */
  tier: number;
  criteria: BadgeKind;
}

/**
 * The ladders, in the order a badge list should read them: what you do first,
 * then what it earns you, then keeping it up, then doing it for other people.
 */
export const BADGE_FAMILIES = [
  { key: 'tasks', label: 'Tasks approved', blurb: 'Work you finished and someone signed off.' },
  { key: 'points', label: 'Points', blurb: 'Credits earned from approved work.' },
  { key: 'streak', label: 'Streak', blurb: 'Consecutive days with approved work.' },
  { key: 'reviews', label: 'Reviews given', blurb: 'Checking other people’s work.' },
] as const satisfies readonly { key: BadgeFamily; label: string; blurb: string }[];

export const BADGES = [
  // Tasks approved — 1 / 10 / 50 / 200.
  {
    key: 'first_approved',
    name: 'First step',
    description: 'Got your first task approved.',
    emoji: '🌱',
    family: 'tasks',
    tier: 1,
    criteria: { type: 'tasks_approved', count: 1 },
  },
  {
    key: 'tasks_10',
    name: 'In motion',
    description: 'Got 10 tasks approved.',
    emoji: '🌿',
    family: 'tasks',
    tier: 2,
    criteria: { type: 'tasks_approved', count: 10 },
  },
  {
    key: 'tasks_50',
    name: 'Steady hand',
    description: 'Got 50 tasks approved.',
    emoji: '🌳',
    family: 'tasks',
    tier: 3,
    criteria: { type: 'tasks_approved', count: 50 },
  },
  {
    key: 'tasks_200',
    name: 'Two hundred done',
    description: 'Got 200 tasks approved.',
    emoji: '🏔️',
    family: 'tasks',
    tier: 4,
    criteria: { type: 'tasks_approved', count: 200 },
  },

  // Points — 100 / 500 / 2,000 / 10,000.
  {
    key: 'credits_100',
    name: 'Getting going',
    description: 'Earned 100 credits.',
    emoji: '⭐',
    family: 'points',
    tier: 1,
    criteria: { type: 'credits', threshold: 100 },
  },
  {
    key: 'credits_500',
    name: 'Committed',
    description: 'Earned 500 credits.',
    emoji: '🔥',
    family: 'points',
    tier: 2,
    criteria: { type: 'credits', threshold: 500 },
  },
  {
    key: 'credits_2000',
    name: 'Relentless',
    description: 'Earned 2,000 credits.',
    emoji: '🚀',
    family: 'points',
    tier: 3,
    criteria: { type: 'credits', threshold: 2000 },
  },
  {
    key: 'credits_10000',
    name: 'Legend',
    description: 'Earned 10,000 credits.',
    emoji: '👑',
    family: 'points',
    tier: 4,
    criteria: { type: 'credits', threshold: 10000 },
  },

  // Streak — 3 / 7 / 30 / 100. Three days comes first because seven was a long
  // way from nothing, and the rung nobody can see is the rung nobody climbs.
  {
    key: 'streak_3',
    name: 'Three in a row',
    description: 'Kept a 3-day streak.',
    emoji: '✨',
    family: 'streak',
    tier: 1,
    criteria: { type: 'streak', days: 3 },
  },
  {
    key: 'streak_7',
    name: 'Seven days',
    description: 'Kept a 7-day streak.',
    emoji: '📅',
    family: 'streak',
    tier: 2,
    criteria: { type: 'streak', days: 7 },
  },
  {
    key: 'streak_30',
    name: 'Thirty days',
    description: 'Kept a 30-day streak.',
    emoji: '🏆',
    family: 'streak',
    tier: 3,
    criteria: { type: 'streak', days: 30 },
  },
  {
    key: 'streak_100',
    name: 'A hundred days',
    description: 'Kept a 100-day streak.',
    emoji: '💯',
    family: 'streak',
    tier: 4,
    criteria: { type: 'streak', days: 100 },
  },

  // Reviews given — 10 / 50 / 200. The ladder that keeps the app working:
  // nobody's task gets approved unless somebody else looks at it.
  {
    key: 'reviews_10',
    name: 'Second pair of eyes',
    description: 'Reviewed 10 tasks for other people.',
    emoji: '👀',
    family: 'reviews',
    tier: 1,
    criteria: { type: 'reviews_given', count: 10 },
  },
  {
    key: 'helpful_buddy',
    name: 'Helpful buddy',
    description: 'Reviewed 50 tasks for other people.',
    emoji: '🤝',
    family: 'reviews',
    tier: 2,
    criteria: { type: 'reviews_given', count: 50 },
  },
  {
    key: 'reviews_200',
    name: 'Everyone’s buddy',
    description: 'Reviewed 200 tasks for other people.',
    emoji: '🫶',
    family: 'reviews',
    tier: 3,
    criteria: { type: 'reviews_given', count: 200 },
  },
] as const satisfies readonly Badge[];

export type BadgeKey = (typeof BADGES)[number]['key'];

export const BADGE_KEYS = BADGES.map((b) => b.key) as [BadgeKey, ...BadgeKey[]];

export function badge(key: BadgeKey): Badge {
  return BADGES.find((b) => b.key === key)!;
}

/** The stats every badge is decided from — the countable columns of `user_stats`. */
export interface BadgeStats {
  totalCredits: number;
  currentStreak: number;
  tasksApproved: number;
  reviewsGiven: number;
}

/**
 * What a badge measures, and what it takes, for one set of stats.
 *
 * Both "have you earned it" and "how far off are you" read this, so a badge can
 * never be shown as 50 of 50 while still rendering as locked.
 */
function measure(criteria: BadgeKind, stats: BadgeStats): { current: number; target: number } {
  switch (criteria.type) {
    case 'credits':
      return { current: stats.totalCredits, target: criteria.threshold };
    case 'streak':
      return { current: stats.currentStreak, target: criteria.days };
    case 'tasks_approved':
      return { current: stats.tasksApproved, target: criteria.count };
    case 'reviews_given':
      return { current: stats.reviewsGiven, target: criteria.count };
  }
}

/**
 * Every badge the given stats qualify for. Callers diff this against the
 * badges already awarded — awarding is idempotent by (user_id, badge_key).
 */
export function earnedBadges(stats: BadgeStats): BadgeKey[] {
  return BADGES.filter((b) => {
    const { current, target } = measure(b.criteria, stats);
    return current >= target;
  }).map((b) => b.key);
}

export interface BadgeProgress {
  badge: Badge;
  /** Held, or qualified for right now. Badges are never taken back — see below. */
  earned: boolean;
  /** Where the counter stands, pinned to the target once the badge is held. */
  current: number;
  target: number;
  /** 0–1, for a bar. */
  fraction: number;
}

/**
 * The whole ladder, earned and locked alike, in `BADGES` order.
 *
 * `held` is the set already awarded on the server. It is passed in and unioned
 * rather than recomputed, because the two can legitimately disagree: a streak
 * badge is awarded the day the streak reaches seven and kept afterwards, so
 * someone holding `streak_7` on a current streak of 2 has genuinely earned it.
 * Recomputing alone would quietly un-earn it on screen.
 */
export function badgeProgress(stats: BadgeStats, held: readonly string[] = []): BadgeProgress[] {
  const awarded = new Set(held);
  return BADGES.map((b) => {
    const { current, target } = measure(b.criteria, stats);
    const earned = awarded.has(b.key) || current >= target;
    return {
      badge: b,
      earned,
      current: earned ? target : current,
      target,
      fraction: earned ? 1 : Math.max(0, Math.min(1, current / target)),
    };
  });
}

/**
 * The locked badge closest to being earned — the one line worth putting beside
 * someone's point total. `null` once every badge is held.
 */
export function nextBadge(stats: BadgeStats, held: readonly string[] = []): BadgeProgress | null {
  const locked = badgeProgress(stats, held).filter((p) => !p.earned);
  if (locked.length === 0) return null;
  // Ties break toward the earlier rung, which `BADGES` order already gives us:
  // the incumbent is kept unless the challenger is strictly closer.
  return locked.reduce((best, p) => (p.fraction > best.fraction ? p : best));
}
