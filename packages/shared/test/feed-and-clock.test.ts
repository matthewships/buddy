import { describe, expect, it } from 'vitest';

import {
  ABANDON_PENALTY,
  MAX_REPLY_TEXT,
  MAX_TASK_MINUTES,
  MIN_TASK_MINUTES,
  REACTIONS,
  REACTION_KEYS,
  abandonPenalty,
  reactionEmoji,
} from '../src/index';
import {
  createPostSchema,
  createReplySchema,
  createTaskSchema,
  inviteTokenSchema,
  reactToPostSchema,
  setGroupBuddySchema,
} from '../src/schemas';

describe('reactions', () => {
  it('has unique keys and an emoji for each', () => {
    const keys = REACTIONS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(REACTIONS.every((r) => r.emoji.length > 0)).toBe(true);
  });

  it('offers nothing negative', () => {
    // The Feed is the one surface in Buddy that is not about being marked; a
    // product built on other people rating your work should not also hand them
    // a way to boo.
    for (const banned of ['dislike', 'thumbsdown', 'angry', 'sad', 'cry', 'poop']) {
      expect(REACTION_KEYS).not.toContain(banned);
    }
  });

  it('resolves an emoji for every key', () => {
    expect(REACTION_KEYS.map(reactionEmoji).every(Boolean)).toBe(true);
  });
});

describe('abandonPenalty', () => {
  it('takes the flat penalty from a healthy balance', () => {
    expect(abandonPenalty(100)).toBe(-ABANDON_PENALTY);
  });

  it('never takes someone below zero', () => {
    // A leaderboard with negative scores reads as "worse than absent", which is
    // not what the product means; someone abandoning their first task lands on
    // nothing, not in debt.
    expect(abandonPenalty(4)).toBe(-4);
    expect(abandonPenalty(0)).toBe(0);
    expect(abandonPenalty(-50)).toBe(0);
  });
});

describe('createTaskSchema', () => {
  const base = { groupId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', title: 'Read', dueDate: '2026-09-01' };

  it('accepts a task with no estimate', () => {
    // Required on the wire would break every task the mobile app creates, at
    // runtime. The web form requires one; the schema must not.
    expect(createTaskSchema.safeParse(base).success).toBe(true);
  });

  it('accepts one within the bounds and rejects one outside', () => {
    expect(createTaskSchema.safeParse({ ...base, estimatedMinutes: 60 }).success).toBe(true);
    expect(
      createTaskSchema.safeParse({ ...base, estimatedMinutes: MIN_TASK_MINUTES - 1 }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({ ...base, estimatedMinutes: MAX_TASK_MINUTES + 1 }).success,
    ).toBe(false);
  });
});

describe('setGroupBuddySchema', () => {
  const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  it('allows clearing the Buddy', () => {
    expect(setGroupBuddySchema.safeParse({ buddyUserId: null }).success).toBe(true);
  });

  it('accepts a Buddy and their nominated verifier', () => {
    expect(
      setGroupBuddySchema.safeParse({ buddyUserId: id, verifierUserId: id }).success,
    ).toBe(true);
  });
});

describe('a post is words, a photo, or both', () => {
  it('accepts a photo alone', () => {
    expect(createPostSchema.safeParse({ imageKey: 'posts/u/1' }).success).toBe(true);
  });

  it('accepts words alone — the Feed is not only for people with a camera', () => {
    expect(createPostSchema.safeParse({ caption: 'Finished chapter four' }).success).toBe(true);
  });

  it('accepts both', () => {
    expect(
      createPostSchema.safeParse({ imageKey: 'posts/u/1', caption: 'Four hours' }).success,
    ).toBe(true);
  });

  it('refuses a post that is neither', () => {
    expect(createPostSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a caption of whitespace, which is not words', () => {
    expect(createPostSchema.safeParse({ caption: '   ' }).success).toBe(false);
  });
});

describe('createReplySchema', () => {
  it('needs something in it', () => {
    expect(createReplySchema.safeParse({ body: '' }).success).toBe(false);
    expect(createReplySchema.safeParse({ body: '  ' }).success).toBe(false);
  });

  it('trims and caps', () => {
    expect(createReplySchema.parse({ body: '  Nice one  ' }).body).toBe('Nice one');
    expect(createReplySchema.safeParse({ body: 'x'.repeat(MAX_REPLY_TEXT) }).success).toBe(true);
    expect(createReplySchema.safeParse({ body: 'x'.repeat(MAX_REPLY_TEXT + 1) }).success).toBe(
      false,
    );
  });
});

describe('post schemas', () => {
  it('caps the caption', () => {
    expect(
      createPostSchema.safeParse({ imageKey: 'posts/u/1', caption: 'x'.repeat(400) }).success,
    ).toBe(false);
  });

  it('only accepts a reaction from the list', () => {
    expect(reactToPostSchema.safeParse({ reaction: 'fire' }).success).toBe(true);
    expect(reactToPostSchema.safeParse({ reaction: 'thumbsdown' }).success).toBe(false);
  });
});

describe('inviteTokenSchema', () => {
  it('accepts a URL-safe token and rejects anything else', () => {
    expect(inviteTokenSchema.safeParse('a'.repeat(43)).success).toBe(true);
    expect(inviteTokenSchema.safeParse('short').success).toBe(false);
    expect(inviteTokenSchema.safeParse('has/slash/and+plus====').success).toBe(false);
  });
});
