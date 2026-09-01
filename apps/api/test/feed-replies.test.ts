import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_REPLY_TEXT } from '@buddy/shared';

import { del, get, onboard, post, resetRateLimits, signUp, type Session } from './helpers.js';

beforeEach(resetRateLimits);

async function poster(email: string, handle: string): Promise<Session> {
  const session = await signUp(email);
  await onboard(session, handle);
  return session;
}

function keyFor(session: Session): string {
  return `posts/${session.userId}/${crypto.randomUUID()}`;
}

interface FeedPost {
  id: string;
  imageKey: string | null;
  caption: string | null;
  replyCount: number;
}

async function feed(session: Session): Promise<FeedPost[]> {
  const res = await get('/api/posts', session.accessToken);
  expect(res.status).toBe(200);
  return ((await res.json()) as { posts: FeedPost[] }).posts;
}

async function repliesOn(session: Session, postId: string) {
  const res = await get(`/api/posts/${postId}/replies`, session.accessToken);
  expect(res.status).toBe(200);
  return ((await res.json()) as {
    replies: { id: string; body: string; author: { handle: string } }[];
  }).replies;
}

/**
 * A post is a photo, a few words, or both (§2.7).
 *
 * The photo used to be required, which made the Feed a place you could only
 * reach with a camera. `image_key` is still NOT NULL underneath — a text-only
 * post stores `''` — so these tests are as much about the sentinel never
 * escaping the route layer as about the feature.
 */
describe('posting words, a photo, or both', () => {
  it('accepts a post that is only words', async () => {
    const author = await poster('words@example.com', 'wordsonly');
    const res = await post('/api/posts', { caption: 'Finally finished chapter four' }, author.accessToken);
    expect(res.status).toBe(201);
    expect((await res.json() as { imageKey: string | null }).imageKey).toBeNull();

    const posted = (await feed(author)).find((p) => p.caption === 'Finally finished chapter four');
    // Null, never the empty string the column actually holds.
    expect(posted?.imageKey).toBeNull();
  });

  it('accepts a post that is only a photo', async () => {
    const author = await poster('photo@example.com', 'photoonly');
    const key = keyFor(author);
    const res = await post('/api/posts', { imageKey: key }, author.accessToken);
    expect(res.status).toBe(201);

    const posted = (await feed(author)).find((p) => p.imageKey === key);
    expect(posted?.caption).toBeNull();
  });

  it('refuses a post that is neither', async () => {
    const author = await poster('empty@example.com', 'emptypost');
    expect((await post('/api/posts', {}, author.accessToken)).status).toBe(400);
    // Whitespace is not words.
    expect((await post('/api/posts', { caption: '   ' }, author.accessToken)).status).toBe(400);
  });

  it('still refuses someone else’s upload key', async () => {
    const author = await poster('key-a@example.com', 'keya');
    const other = await poster('key-b@example.com', 'keyb');
    const res = await post(
      '/api/posts',
      { imageKey: keyFor(other), caption: 'Not mine' },
      author.accessToken,
    );
    expect(res.status).toBe(400);
  });

  it('deletes a text-only post without reaching for a photo', async () => {
    const author = await poster('deltext@example.com', 'deltext');
    const created = await post('/api/posts', { caption: 'Words alone' }, author.accessToken);
    const { id } = (await created.json()) as { id: string };

    const res = await del(`/api/posts/${id}`, author.accessToken);
    expect(res.status).toBe(200);
    expect((await feed(author)).some((p) => p.id === id)).toBe(false);
  });
});

/** Replies (§2.7): a flat list per post, and a count on the post itself. */
describe('replies', () => {
  it('records a reply and counts it on the post', async () => {
    const author = await poster('rep-a@example.com', 'repa');
    const friend = await poster('rep-b@example.com', 'repb');
    const created = await post('/api/posts', { caption: 'Done for the day' }, author.accessToken);
    const { id } = (await created.json()) as { id: string };

    expect((await feed(author)).find((p) => p.id === id)?.replyCount).toBe(0);

    const res = await post(`/api/posts/${id}/replies`, { body: 'Nice one' }, friend.accessToken);
    expect(res.status).toBe(201);

    const replies = await repliesOn(author, id);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ body: 'Nice one', author: { handle: 'repb' } });
    // The count on the post and the list behind it are the same number.
    expect((await feed(author)).find((p) => p.id === id)?.replyCount).toBe(1);
  });

  it('keeps replies in the order they were said', async () => {
    const author = await poster('rep-order@example.com', 'reporder');
    const created = await post('/api/posts', { caption: 'Thread' }, author.accessToken);
    const { id } = (await created.json()) as { id: string };

    for (const body of ['first', 'second', 'third']) {
      const res = await post(`/api/posts/${id}/replies`, { body }, author.accessToken);
      expect(res.status).toBe(201);
    }

    expect((await repliesOn(author, id)).map((r) => r.body)).toEqual(['first', 'second', 'third']);
  });

  it('refuses an empty reply and one that is too long', async () => {
    const author = await poster('rep-bad@example.com', 'repbad');
    const created = await post('/api/posts', { caption: 'Post' }, author.accessToken);
    const { id } = (await created.json()) as { id: string };

    expect((await post(`/api/posts/${id}/replies`, { body: '   ' }, author.accessToken)).status).toBe(400);
    expect(
      (await post(`/api/posts/${id}/replies`, { body: 'x'.repeat(MAX_REPLY_TEXT + 1) }, author.accessToken))
        .status,
    ).toBe(400);
  });

  it('has nothing to say about a post that was deleted', async () => {
    const author = await poster('rep-gone@example.com', 'repgone');
    const created = await post('/api/posts', { caption: 'Briefly here' }, author.accessToken);
    const { id } = (await created.json()) as { id: string };
    await del(`/api/posts/${id}`, author.accessToken);

    expect((await get(`/api/posts/${id}/replies`, author.accessToken)).status).toBe(404);
    expect((await post(`/api/posts/${id}/replies`, { body: 'Hello?' }, author.accessToken)).status).toBe(
      404,
    );
  });

  it('404s on a post that never existed', async () => {
    const author = await poster('rep-none@example.com', 'repnone');
    const res = await get('/api/posts/01ARZ3NDEKTSV4RRFFQ69G5FAV/replies', author.accessToken);
    expect(res.status).toBe(404);
  });
});
