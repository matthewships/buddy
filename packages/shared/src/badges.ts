/**
 * Badge definitions (§2.5). These are configuration, not a database table —
 * `user_badges` only records which key was awarded and when, so adding a badge
 * here makes it awardable without a migration.
 */
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
  criteria: BadgeKind;
}

export const BADGES = [
  {
    key: 'first_approved',
    name: 'First step',
    description: 'Got your first task approved.',
    emoji: '🌱',
    criteria: { type: 'tasks_approved', count: 1 },
  },
  {
    key: 'credits_100',
    name: 'Getting going',
    description: 'Earned 100 credits.',
    emoji: '⭐',
    criteria: { type: 'credits', threshold: 100 },
  },
  {
    key: 'credits_500',
    name: 'Committed',
    description: 'Earned 500 credits.',
    emoji: '🔥',
    criteria: { type: 'credits', threshold: 500 },
  },
  {
    key: 'credits_2000',
    name: 'Relentless',
    description: 'Earned 2,000 credits.',
    emoji: '🚀',
    criteria: { type: 'credits', threshold: 2000 },
  },
  {
    key: 'credits_10000',
    name: 'Legend',
    description: 'Earned 10,000 credits.',
    emoji: '👑',
    criteria: { type: 'credits', threshold: 10000 },
  },
  {
    key: 'streak_7',
    name: 'Seven days',
    description: 'Kept a 7-day streak.',
    emoji: '📅',
    criteria: { type: 'streak', days: 7 },
  },
  {
    key: 'streak_30',
    name: 'Thirty days',
    description: 'Kept a 30-day streak.',
    emoji: '🏆',
    criteria: { type: 'streak', days: 30 },
  },
  {
    key: 'helpful_buddy',
    name: 'Helpful buddy',
    description: 'Reviewed 50 tasks for other people.',
    emoji: '🤝',
    criteria: { type: 'reviews_given', count: 50 },
  },
] as const satisfies readonly Badge[];

export type BadgeKey = (typeof BADGES)[number]['key'];

export const BADGE_KEYS = BADGES.map((b) => b.key) as [BadgeKey, ...BadgeKey[]];

export function badge(key: BadgeKey): Badge {
  return BADGES.find((b) => b.key === key)!;
}

/**
 * Every badge the given stats qualify for. Callers diff this against the
 * badges already awarded — awarding is idempotent by (user_id, badge_key).
 */
export function earnedBadges(stats: {
  totalCredits: number;
  currentStreak: number;
  tasksApproved: number;
  reviewsGiven: number;
}): BadgeKey[] {
  return BADGES.filter((b) => {
    switch (b.criteria.type) {
      case 'credits':
        return stats.totalCredits >= b.criteria.threshold;
      case 'streak':
        return stats.currentStreak >= b.criteria.days;
      case 'tasks_approved':
        return stats.tasksApproved >= b.criteria.count;
      case 'reviews_given':
        return stats.reviewsGiven >= b.criteria.count;
    }
  }).map((b) => b.key);
}
