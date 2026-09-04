import { describe, expect, it } from 'vitest';

import {
  createTaskSchema,
  emailSchema,
  listMessagesQuerySchema,
  goalSchema,
  handleSchema,
  localDateSchema,
  reviewTaskSchema,
  timezoneSchema,
  updateMeSchema,
} from '../src/schemas';
import {
  DEFAULT_PAGE_SIZE,
  GOAL_KEYS,
  MAX_GOAL_TEXT,
  MAX_INDEXED_GOALS,
  MAX_INTEREST_TEXT,
  MAX_PAGE_SIZE,
  BADGES,
  BADGE_FAMILIES,
  badgeProgress,
  creditsForRating,
  earnedBadges,
  nextBadge,
} from '../src/index';

describe('emailSchema', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(emailSchema.parse('  Masoud@Example.COM ')).toBe('masoud@example.com');
  });

  it('rejects a malformed address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('handleSchema', () => {
  it('lowercases a valid handle', () => {
    expect(handleSchema.parse('Masoud_99')).toBe('masoud_99');
  });

  it.each(['ab', 'has space', 'has-dash', 'hasCAPS!'])('rejects %j', (bad) => {
    expect(handleSchema.safeParse(bad).success).toBe(false);
  });
});

describe('timezoneSchema', () => {
  it('accepts an IANA zone', () => {
    expect(timezoneSchema.parse('Asia/Muscat')).toBe('Asia/Muscat');
  });

  it('rejects a made-up zone', () => {
    expect(timezoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('localDateSchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(localDateSchema.parse('2026-08-27')).toBe('2026-08-27');
  });

  it('rejects a full timestamp', () => {
    expect(localDateSchema.safeParse('2026-08-27T10:00:00Z').success).toBe(false);
  });
});

describe('goalSchema', () => {
  it('requires free text when the key is custom', () => {
    const result = goalSchema.safeParse({ goalKey: 'custom' });
    expect(result.success).toBe(false);
  });

  it('accepts custom with text', () => {
    expect(goalSchema.parse({ goalKey: 'custom', goalText: 'Ship Buddy v1' })).toEqual({
      goalKey: 'custom',
      goalText: 'Ship Buddy v1',
    });
  });

  it('allows a listed key with no text', () => {
    expect(goalSchema.parse({ goalKey: 'thesis' }).goalKey).toBe('thesis');
  });

  it('rejects an unknown key', () => {
    expect(goalSchema.safeParse({ goalKey: 'become_a_wizard' }).success).toBe(false);
  });

  it('accepts a second goal', () => {
    const parsed = goalSchema.parse({ goalKey: 'thesis', goalKey2: 'fitness' });
    expect(parsed.goalKey).toBe('thesis');
    expect(parsed.goalKey2).toBe('fitness');
  });

  it('allows the second goal to be omitted or null', () => {
    expect(goalSchema.parse({ goalKey: 'thesis' }).goalKey2).toBeUndefined();
    expect(goalSchema.parse({ goalKey: 'thesis', goalKey2: null }).goalKey2).toBeNull();
  });

  it('rejects the same goal twice', () => {
    const result = goalSchema.safeParse({ goalKey: 'thesis', goalKey2: 'thesis' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown second key', () => {
    expect(
      goalSchema.safeParse({ goalKey: 'thesis', goalKey2: 'become_a_wizard' }).success,
    ).toBe(false);
  });

  /**
   * Signup stopped capping the picker, so the list has to survive the schema
   * whole — the cap that used to be here is now only the width of the indexed
   * pair the route derives from it.
   */
  it('accepts as many goals as the list has', () => {
    // The whole list includes `custom`, which drags its text requirement along.
    const parsed = goalSchema.parse({
      goalKey: 'thesis',
      goalKeys: [...GOAL_KEYS],
      goalText: 'And one of my own',
    });
    expect(parsed.goalKeys).toHaveLength(GOAL_KEYS.length);
    expect(parsed.goalKeys?.length).toBeGreaterThan(MAX_INDEXED_GOALS);
  });

  it('deduplicates a list that repeats a goal, keeping first-pick order', () => {
    const parsed = goalSchema.parse({
      goalKey: 'thesis',
      goalKeys: ['thesis', 'fitness', 'thesis', 'coding'],
    });
    expect(parsed.goalKeys).toEqual(['thesis', 'fitness', 'coding']);
  });

  it('rejects an unknown key inside the list', () => {
    expect(
      goalSchema.safeParse({ goalKey: 'thesis', goalKeys: ['thesis', 'become_a_wizard'] }).success,
    ).toBe(false);
  });

  it('requires goal text when custom is anywhere in the list, not just first', () => {
    expect(goalSchema.safeParse({ goalKey: 'thesis', goalKeys: ['thesis', 'custom'] }).success).toBe(
      false,
    );
    expect(
      goalSchema.safeParse({
        goalKey: 'thesis',
        goalKeys: ['thesis', 'custom'],
        goalText: 'Learn to sail',
      }).success,
    ).toBe(true);
  });

  it('accepts goal text up to MAX_GOAL_TEXT and rejects one character more', () => {
    expect(
      goalSchema.safeParse({ goalKey: 'thesis', goalText: 'x'.repeat(MAX_GOAL_TEXT) }).success,
    ).toBe(true);
    expect(
      goalSchema.safeParse({ goalKey: 'thesis', goalText: 'x'.repeat(MAX_GOAL_TEXT + 1) }).success,
    ).toBe(false);
  });
});

describe('updateMeSchema', () => {
  it('accepts a partial patch', () => {
    expect(updateMeSchema.parse({ isOpenBuddy: true })).toEqual({ isOpenBuddy: true });
  });

  it('still enforces the custom-goal rule on a patch', () => {
    expect(updateMeSchema.safeParse({ goalKey: 'custom' }).success).toBe(false);
  });

  it('accepts both goals in one patch', () => {
    const parsed = updateMeSchema.parse({ goalKey: 'thesis', goalKey2: 'coding' });
    expect(parsed).toEqual({ goalKey: 'thesis', goalKey2: 'coding' });
  });

  it('rejects a patch setting both goals to the same key', () => {
    expect(updateMeSchema.safeParse({ goalKey: 'thesis', goalKey2: 'thesis' }).success).toBe(
      false,
    );
  });

  it('accepts a lone goalKey2, which the route checks against the stored goal', () => {
    expect(updateMeSchema.safeParse({ goalKey2: 'fitness' }).success).toBe(true);
  });

  it('accepts null to clear the second goal', () => {
    expect(updateMeSchema.parse({ goalKey2: null }).goalKey2).toBeNull();
  });

  it('accepts a goals list on its own, for the client that no longer sends a pair', () => {
    const parsed = updateMeSchema.parse({ goalKeys: ['thesis', 'fitness', 'coding', 'reading'] });
    expect(parsed.goalKeys).toEqual(['thesis', 'fitness', 'coding', 'reading']);
    expect(parsed.goalKey).toBeUndefined();
  });

  it('enforces the custom rule against the list, not only the primary key', () => {
    expect(updateMeSchema.safeParse({ goalKeys: ['thesis', 'custom'] }).success).toBe(false);
    expect(
      updateMeSchema.safeParse({ goalKeys: ['thesis', 'custom'], goalText: 'Sail' }).success,
    ).toBe(true);
  });

  it('requires text for the Other hobby, and only when interests are sent', () => {
    expect(updateMeSchema.safeParse({ interests: ['custom'] }).success).toBe(false);
    expect(
      updateMeSchema.safeParse({ interests: ['custom'], interestText: 'Falconry' }).success,
    ).toBe(true);
    // A patch that touches something else entirely is not judged on a `custom`
    // the user picked long ago.
    expect(updateMeSchema.safeParse({ bio: 'hello' }).success).toBe(true);
  });

  it('caps the Other hobby text', () => {
    expect(
      updateMeSchema.safeParse({
        interests: ['custom'],
        interestText: 'x'.repeat(MAX_INTEREST_TEXT + 1),
      }).success,
    ).toBe(false);
  });
});

describe('reviewTaskSchema', () => {
  it('requires a rating when approving', () => {
    expect(reviewTaskSchema.safeParse({ action: 'approve' }).success).toBe(false);
  });

  it('accepts an approval with a rating', () => {
    expect(reviewTaskSchema.parse({ action: 'approve', rating: 4 })).toMatchObject({ rating: 4 });
  });

  it('rejects a rating outside 0-5', () => {
    expect(reviewTaskSchema.safeParse({ action: 'approve', rating: 6 }).success).toBe(false);
  });

  it('takes request_proof with no rating', () => {
    expect(reviewTaskSchema.parse({ action: 'request_proof' }).action).toBe('request_proof');
  });

  it('rejects a rating smuggled into request_proof', () => {
    const parsed = reviewTaskSchema.parse({ action: 'request_proof', rating: 5 } as never);
    expect(parsed).not.toHaveProperty('rating');
  });
});

describe('createTaskSchema', () => {
  it('rejects a non-ULID group id', () => {
    expect(
      createTaskSchema.safeParse({ groupId: 'abc', title: 'Read', dueDate: '2026-08-27' }).success,
    ).toBe(false);
  });

  it('accepts a valid task', () => {
    const ulid = '01J9ZQWX8T0000000000000000';
    expect(
      createTaskSchema.parse({ groupId: ulid, title: '  Read 20 pages ', dueDate: '2026-08-27' })
        .title,
    ).toBe('Read 20 pages');
  });
});

describe('credit rules', () => {
  it('pays rating x 10', () => {
    expect(creditsForRating(4)).toBe(40);
  });

  it('pays nothing for a 0 rating', () => {
    expect(creditsForRating(0)).toBe(0);
  });

  it('refuses an out-of-range rating', () => {
    expect(() => creditsForRating(7)).toThrow(RangeError);
  });
});

describe('earnedBadges', () => {
  it('awards nothing to a brand-new user', () => {
    expect(
      earnedBadges({ totalCredits: 0, currentStreak: 0, tasksApproved: 0, reviewsGiven: 0 }),
    ).toEqual([]);
  });

  it('awards the first-task and 100-credit badges together', () => {
    expect(
      earnedBadges({ totalCredits: 120, currentStreak: 1, tasksApproved: 3, reviewsGiven: 0 }),
    ).toEqual(['first_approved', 'credits_100']);
  });

  it('is cumulative at higher thresholds', () => {
    const earned = earnedBadges({
      totalCredits: 10_000,
      currentStreak: 30,
      tasksApproved: 200,
      reviewsGiven: 50,
    });
    expect(earned).toContain('credits_10000');
    expect(earned).toContain('streak_30');
    expect(earned).toContain('helpful_buddy');
  });
});

describe('badge ladders', () => {
  it('gives every badge a family that BADGE_FAMILIES declares', () => {
    const families = new Set(BADGE_FAMILIES.map((f) => f.key));
    for (const b of BADGES) expect(families.has(b.family)).toBe(true);
  });

  it('numbers each family 1..n with no gaps or repeats', () => {
    for (const family of BADGE_FAMILIES) {
      const tiers = BADGES.filter((b) => b.family === family.key).map((b) => b.tier);
      expect(tiers).toEqual(tiers.map((_, i) => i + 1));
    }
  });

  it('raises the bar at every rung, so a higher tier is never easier', () => {
    for (const family of BADGE_FAMILIES) {
      const targets = BADGES.filter((b) => b.family === family.key).map((b) =>
        // Each criteria kind names its number differently; the ladder only
        // cares that the numbers climb.
        b.criteria.type === 'credits'
          ? b.criteria.threshold
          : b.criteria.type === 'streak'
            ? b.criteria.days
            : b.criteria.count,
      );
      expect(targets).toEqual([...targets].sort((a, z) => a - z));
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('has no duplicate keys', () => {
    const keys = BADGES.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('badgeProgress', () => {
  const nobody = { totalCredits: 0, currentStreak: 0, tasksApproved: 0, reviewsGiven: 0 };

  it('returns the whole ladder, not only what is earned', () => {
    expect(badgeProgress(nobody)).toHaveLength(BADGES.length);
    expect(badgeProgress(nobody).every((p) => !p.earned)).toBe(true);
  });

  it('measures a locked badge against its own target', () => {
    const progress = badgeProgress({ ...nobody, totalCredits: 250 });
    const committed = progress.find((p) => p.badge.key === 'credits_500')!;
    expect(committed).toMatchObject({ earned: false, current: 250, target: 500, fraction: 0.5 });
  });

  it('pins an earned badge to its target rather than showing 250 of 100', () => {
    const gettingGoing = badgeProgress({ ...nobody, totalCredits: 250 }).find(
      (p) => p.badge.key === 'credits_100',
    )!;
    expect(gettingGoing).toMatchObject({ earned: true, current: 100, target: 100, fraction: 1 });
  });

  it('keeps a held badge earned after the streak behind it is broken', () => {
    const broken = { ...nobody, currentStreak: 2 };
    expect(badgeProgress(broken).find((p) => p.badge.key === 'streak_7')!.earned).toBe(false);
    expect(badgeProgress(broken, ['streak_7']).find((p) => p.badge.key === 'streak_7')!.earned).toBe(
      true,
    );
  });

  it('never reports a fraction outside 0..1', () => {
    const huge = {
      totalCredits: 999_999,
      currentStreak: 999,
      tasksApproved: 999,
      reviewsGiven: 999,
    };
    for (const p of [...badgeProgress(huge), ...badgeProgress(nobody)]) {
      expect(p.fraction).toBeGreaterThanOrEqual(0);
      expect(p.fraction).toBeLessThanOrEqual(1);
    }
  });
});

describe('nextBadge', () => {
  const nobody = { totalCredits: 0, currentStreak: 0, tasksApproved: 0, reviewsGiven: 0 };

  it('points a brand-new user at the one task that unlocks something', () => {
    expect(nextBadge(nobody)!.badge.key).toBe('first_approved');
  });

  it('picks the closest locked badge, not the next one in the list', () => {
    // 90 of 100 credits beats 1 of 3 days and 2 of 10 tasks.
    const next = nextBadge({
      totalCredits: 90,
      currentStreak: 1,
      tasksApproved: 2,
      reviewsGiven: 0,
    })!;
    expect(next.badge.key).toBe('credits_100');
    expect(next.current).toBe(90);
  });

  it('skips a badge already held even when the stats no longer qualify', () => {
    const stats = { totalCredits: 0, currentStreak: 0, tasksApproved: 1, reviewsGiven: 0 };
    expect(nextBadge(stats)!.badge.key).not.toBe('first_approved');
  });

  it('is null once every badge is held', () => {
    expect(
      nextBadge({
        totalCredits: 10_000,
        currentStreak: 100,
        tasksApproved: 200,
        reviewsGiven: 200,
      }),
    ).toBeNull();
  });
});

describe('listMessagesQuerySchema', () => {
  it('accepts an ISO timestamp as the "before" cursor and defaults the page size', () => {
    const parsed = listMessagesQuerySchema.parse({ before: '2026-08-27T10:00:00.000Z' });
    expect(parsed.before).toBe('2026-08-27T10:00:00.000Z');
    expect(parsed.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('rejects a bare calendar date, which would silently page from midnight', () => {
    expect(listMessagesQuerySchema.safeParse({ before: '2026-08-27' }).success).toBe(false);
  });

  it('caps the page size', () => {
    expect(listMessagesQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
});
