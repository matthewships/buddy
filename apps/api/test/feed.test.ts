import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { REACTIONS } from '@buddy/shared';

import { del, get, onboard, post, resetRateLimits, signUp, type Session } from './helpers.js';

beforeEach(resetRateLimits);

async function poster(email: string, handle: string): Promise<Session> {
  const session = await signUp(email);
  await onboard(session, handle);
  return session;
}

/** Uploads nothing — just claims a key of the shape the API will accept. */
function keyFor(session: Session): string {
  return `posts/${session.userId}/${crypto.randomUUID()}`;
}

async function createPost(session: Session, caption = 'Six hours down'): Promise<string> {
  const res = await post(
    '/api/posts',
    { imageKey: keyFor(session), caption },
    session.accessToken,
  );
  expect(res.status).toBe(201);
  return (await res.json() as { id: string }).id;
}

describe('the feed', () => {
  it('shows one user’s post to another', async () => {
    // Global by design: a brand-new account with no group still has something
    // to look at.
    const a = await poster('feed-a@example.com', 'feeda');
    const b = await poster('feed-b@example.com', 'feedb');
    const id = await createPost(a);

    const body = (await (await get('/api/posts', b.accessToken)).json()) as {
      posts: { id: string; author: { handle: string }; mine: boolean }[];
    };
    const found = body.posts.find((p) => p.id === id)!;
    expect(found.author.handle).toBe('feeda');
    expect(found.mine).toBe(false);
  });

  it('refuses an image key belonging to someone else', async () => {
    const a = await poster('feed-key-a@example.com', 'feedkeya');
    const b = await poster('feed-key-b@example.com', 'feedkeyb');

    const res = await post('/api/posts', { imageKey: keyFor(a) }, b.accessToken);
    expect(res.status).toBe(400);
  });

  it('toggles a reaction on and back off', async () => {
    const a = await poster('react-a@example.com', 'reacta');
    const b = await poster('react-b@example.com', 'reactb');
    const id = await createPost(a);

    const on = await post(`/api/posts/${id}/reactions`, { reaction: 'fire' }, b.accessToken);
    expect((await on.json() as { on: boolean }).on).toBe(true);

    const off = await post(`/api/posts/${id}/reactions`, { reaction: 'fire' }, b.accessToken);
    expect((await off.json() as { on: boolean }).on).toBe(false);

    const { results } = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM post_reactions WHERE post_id = ?',
    )
      .bind(id)
      .all<{ n: number }>();
    expect(results[0]!.n).toBe(0);
  });

  it('counts one reaction per person, and reports the viewer’s own', async () => {
    const a = await poster('count-a@example.com', 'counta');
    const b = await poster('count-b@example.com', 'countb');
    const id = await createPost(a);

    await post(`/api/posts/${id}/reactions`, { reaction: 'heart' }, b.accessToken);
    await post(`/api/posts/${id}/reactions`, { reaction: 'heart' }, a.accessToken);

    const body = (await (await get('/api/posts', b.accessToken)).json()) as {
      posts: { id: string; reactions: { reaction: string; count: number; mine: boolean }[] }[];
    };
    const hearts = body.posts.find((p) => p.id === id)!.reactions.find(
      (r) => r.reaction === 'heart',
    )!;
    expect(hearts.count).toBe(2);
    expect(hearts.mine).toBe(true);
  });

  it('rejects an emoji outside the list', async () => {
    const a = await poster('badreact@example.com', 'badreact');
    const id = await createPost(a);
    const res = await post(`/api/posts/${id}/reactions`, { reaction: 'thumbsdown' }, a.accessToken);
    expect(res.status).toBe(400);
    // Every offered reaction is positive; there is nothing to boo with.
    expect(REACTIONS.map((r) => r.key)).not.toContain('thumbsdown');
  });

  it('hides a deleted post', async () => {
    const a = await poster('del-a@example.com', 'dela');
    const b = await poster('del-b@example.com', 'delb');
    const id = await createPost(a);

    expect((await del(`/api/posts/${id}`, a.accessToken)).status).toBe(200);
    const body = (await (await get('/api/posts', b.accessToken)).json()) as {
      posts: { id: string }[];
    };
    expect(body.posts.map((p) => p.id)).not.toContain(id);
  });

  it('will not let someone delete another person’s post', async () => {
    const a = await poster('own-a@example.com', 'owna');
    const b = await poster('own-b@example.com', 'ownb');
    const id = await createPost(a);
    expect((await del(`/api/posts/${id}`, b.accessToken)).status).toBe(403);
  });

  it('takes posts down with the account', async () => {
    // Account deletion is soft, so the cascade never fires — without an explicit
    // delete a departed account's photos would sit on a public feed forever.
    const a = await poster('gone-a@example.com', 'gonea');
    const b = await poster('gone-b@example.com', 'goneb');
    const id = await createPost(a);

    expect((await del('/api/me', a.accessToken)).status).toBe(200);

    const body = (await (await get('/api/posts', b.accessToken)).json()) as {
      posts: { id: string }[];
    };
    expect(body.posts.map((p) => p.id)).not.toContain(id);
  });

  it('pages without repeating or skipping', async () => {
    const a = await poster('page-a@example.com', 'pagea');
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await createPost(a, `post ${i}`));

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const page = (await (
        await get(`/api/posts?limit=2${suffix}`, a.accessToken)
      ).json()) as { posts: { id: string }[]; nextCursor: string | null };
      seen.push(...page.posts.map((p) => p.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(ids));
  });
});
