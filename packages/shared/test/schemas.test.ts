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
} from '../src/schemas.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, creditsForRating, earnedBadges } from '../src/index.js';

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
});

describe('updateMeSchema', () => {
  it('accepts a partial patch', () => {
    expect(updateMeSchema.parse({ isOpenBuddy: true })).toEqual({ isOpenBuddy: true });
  });

  it('still enforces the custom-goal rule on a patch', () => {
    expect(updateMeSchema.safeParse({ goalKey: 'custom' }).success).toBe(false);
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
