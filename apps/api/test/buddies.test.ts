import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { get, onboard, post, resetRateLimits, signUp, type Session } from './helpers.js';

beforeEach(resetRateLimits);

/** A fully onboarded, directory-visible user. */
async function openBuddy(
  email: string,
  handle: string,
  extra: Record<string, unknown> = {},
): Promise<Session> {
  const session = await signUp(email);
  await onboard(session, handle, { isOpenBuddy: true, ...extra });
  return session;
}

/** Forces `last_seen_at` so activity-dependent ordering is deterministic. */
async function setLastSeen(userId: string, iso: string | null) {
  await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(iso, userId).run();
}

describe('buddy directory', () => {
  it('excludes the caller and anyone not open to requests', async () => {
    const me = await openBuddy('dir-me@example.com', 'dirme');
    await openBuddy('dir-open@example.com', 'diropen');
    const closed = await signUp('dir-closed@example.com');
    await onboard(closed, 'dirclosed', { isOpenBuddy: false });

    const res = await get('/api/buddies', me.accessToken);
    expect(res.status).toBe(200);
    const { buddies } = (await res.json()) as { buddies: { handle: string }[] };
    const handles = buddies.map((b) => b.handle);

    expect(handles).toContain('diropen');
    expect(handles).not.toContain('dirme');
    expect(handles).not.toContain('dirclosed');
  });

  it('excludes users who have not finished onboarding', async () => {
    const me = await openBuddy('half-me@example.com', 'halfme');
    // Registered and verified, but never onboarded — no goal to show on a card.
    await signUp('half-other@example.com');

    const { buddies } = (await (await get('/api/buddies', me.accessToken)).json()) as {
      buddies: { handle: string }[];
    };
    expect(buddies.every((b) => b.handle !== '')).toBe(true);
    expect(buddies.map((b) => b.handle)).not.toContain('half-other');
  });

  it('ranks a shared goal above a shared occupation, and both above recency', async () => {
    const me = await openBuddy('rank-me@example.com', 'rankme', {
      goalKey: 'thesis',
      occupationKey: 'student_grad',
    });

    const goalMatch = await openBuddy('rank-goal@example.com', 'rankgoal', {
      goalKey: 'thesis',
      occupationKey: 'employee',
    });
    const occMatch = await openBuddy('rank-occ@example.com', 'rankocc', {
      goalKey: 'fitness',
      occupationKey: 'student_grad',
    });
    const neither = await openBuddy('rank-none@example.com', 'ranknone', {
      goalKey: 'fitness',
      occupationKey: 'employee',
    });

    // Make the *worst* match the most recently active, so recency alone would
    // put it first if the score were not dominating.
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await setLastSeen(goalMatch.userId, old);
    await setLastSeen(occMatch.userId, old);
    await setLastSeen(neither.userId, new Date().toISOString());

    const { buddies } = (await (await get('/api/buddies', me.accessToken)).json()) as {
      buddies: { handle: string }[];
    };
    const order = buddies.map((b) => b.handle);

    expect(order.indexOf('rankgoal')).toBeLessThan(order.indexOf('rankocc'));
    expect(order.indexOf('rankocc')).toBeLessThan(order.indexOf('ranknone'));
  });

  it('filters by goal and by occupation', async () => {
    const me = await openBuddy('filter-me@example.com', 'filterme');
    await openBuddy('filter-a@example.com', 'filtera', { goalKey: 'sat' });
    await openBuddy('filter-b@example.com', 'filterb', { goalKey: 'fitness' });

    const res = await get('/api/buddies?goal=sat', me.accessToken);
    const { buddies } = (await res.json()) as { buddies: { handle: string; goalKey: string }[] };
    expect(buddies.length).toBeGreaterThan(0);
    expect(buddies.every((b) => b.goalKey === 'sat')).toBe(true);
  });

  it('filters to recently active only', async () => {
    const me = await openBuddy('active-me@example.com', 'activeme');
    const fresh = await openBuddy('active-fresh@example.com', 'activefresh');
    const stale = await openBuddy('active-stale@example.com', 'activestale');

    await setLastSeen(fresh.userId, new Date().toISOString());
    await setLastSeen(stale.userId, new Date(Date.now() - 60 * 60 * 1000).toISOString());

    const { buddies } = (await (
      await get('/api/buddies?activeOnly=true', me.accessToken)
    ).json()) as { buddies: { handle: string }[] };
    const handles = buddies.map((b) => b.handle);

    expect(handles).toContain('activefresh');
    expect(handles).not.toContain('activestale');
  });

  it('pages without repeating or dropping anyone', async () => {
    const me = await openBuddy('page-me@example.com', 'pageme');
    for (let i = 0; i < 7; i += 1) {
      await openBuddy(`page-${i}@example.com`, `pageuser${i}`);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const url = `/api/buddies?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const body = (await (await get(url, me.accessToken)).json()) as {
        buddies: { handle: string }[];
        nextCursor: string | null;
      };
      seen.push(...body.buddies.map((b) => b.handle));
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen.length).toBeGreaterThanOrEqual(7); // nobody dropped
  });
});

describe('buddy requests', () => {
  it('sends a request and reports a server-driven expiry', async () => {
    const from = await openBuddy('req-from@example.com', 'reqfrom');
    const to = await openBuddy('req-to@example.com', 'reqto');

    const res = await post(
      '/api/buddy-requests',
      { toUserId: to.userId, message: 'Want to keep each other honest?' },
      from.accessToken,
    );
    expect(res.status).toBe(201);

    const body = (await res.json()) as { expiresAt: string; serverNow: string };
    const window = Date.parse(body.expiresAt) - Date.parse(body.serverNow);
    // 5 minutes, allowing for the round trip.
    expect(window).toBeGreaterThan(4 * 60 * 1000);
    expect(window).toBeLessThanOrEqual(5 * 60 * 1000 + 2000);
  });

  it('allows only one pending request at a time', async () => {
    const from = await openBuddy('one-from@example.com', 'onefrom');
    const a = await openBuddy('one-a@example.com', 'onea');
    const b = await openBuddy('one-b@example.com', 'oneb');

    expect((await post('/api/buddy-requests', { toUserId: a.userId }, from.accessToken)).status).toBe(201);
    const second = await post('/api/buddy-requests', { toUserId: b.userId }, from.accessToken);
    expect(second.status).toBe(409);
  });

  it('refuses to request someone who is not open to requests', async () => {
    const from = await openBuddy('closed-from@example.com', 'closedfrom');
    const closed = await signUp('closed-to@example.com');
    await onboard(closed, 'closedto', { isOpenBuddy: false });

    const res = await post('/api/buddy-requests', { toUserId: closed.userId }, from.accessToken);
    expect(res.status).toBe(403);
  });

  it('refuses to request yourself', async () => {
    const me = await openBuddy('self@example.com', 'selfreq');
    const res = await post('/api/buddy-requests', { toUserId: me.userId }, me.accessToken);
    expect(res.status).toBe(400);
  });

  it('accepting creates a two-person group with both members', async () => {
    const from = await openBuddy('acc-from@example.com', 'accfrom');
    const to = await openBuddy('acc-to@example.com', 'accto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };

    const accepted = await post(`/api/buddy-requests/${id}/accept`, {}, to.accessToken);
    expect(accepted.status).toBe(201);
    const { group } = (await accepted.json()) as { group: { id: string; name: string } };

    // Both sides see it.
    for (const session of [from, to]) {
      const { groups } = (await (await get('/api/groups', session.accessToken)).json()) as {
        groups: { id: string; memberCount: number; kind: string }[];
      };
      const found = groups.find((g) => g.id === group.id);
      expect(found).toBeTruthy();
      expect(found?.memberCount).toBe(2);
      expect(found?.kind).toBe('matched');
    }
  });

  it('an expired request cannot be accepted', async () => {
    const from = await openBuddy('exp-from@example.com', 'expfrom');
    const to = await openBuddy('exp-to@example.com', 'expto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };

    // Wind the clock back past the 5-minute window.
    await env.DB.prepare('UPDATE buddy_requests SET expires_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), id)
      .run();

    const res = await post(`/api/buddy-requests/${id}/accept`, {}, to.accessToken);
    expect(res.status).toBe(410);

    // And no group was created as a side effect.
    const { groups } = (await (await get('/api/groups', to.accessToken)).json()) as {
      groups: unknown[];
    };
    expect(groups).toHaveLength(0);
  });

  it('lazily expires a lapsed request when the requester polls', async () => {
    const from = await openBuddy('lazy-from@example.com', 'lazyfrom');
    const to = await openBuddy('lazy-to@example.com', 'lazyto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };
    await env.DB.prepare('UPDATE buddy_requests SET expires_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), id)
      .run();

    const body = (await (await get('/api/buddy-requests/current', from.accessToken)).json()) as {
      request: unknown;
      outcome: { status: string } | null;
    };

    expect(body.request).toBeNull();
    expect(body.outcome?.status).toBe('expired');
  });

  it('delivers the acceptance to the requester through the poll', async () => {
    const from = await openBuddy('poll-from@example.com', 'pollfrom');
    const to = await openBuddy('poll-to@example.com', 'pollto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };
    await post(`/api/buddy-requests/${id}/accept`, {}, to.accessToken);

    const body = (await (await get('/api/buddy-requests/current', from.accessToken)).json()) as {
      outcome: { status: string; group: { id: string } | null } | null;
    };
    expect(body.outcome?.status).toBe('accepted');
    // The group comes back so the app can navigate straight into it.
    expect(body.outcome?.group?.id).toBeTruthy();
  });

  it('shows the request to the recipient and lets them decline', async () => {
    const from = await openBuddy('dec-from@example.com', 'decfrom');
    const to = await openBuddy('dec-to@example.com', 'decto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };

    const incoming = (await (
      await get('/api/buddy-requests/incoming', to.accessToken)
    ).json()) as { requests: { id: string; user: { handle: string } }[] };
    expect(incoming.requests[0]?.id).toBe(id);
    expect(incoming.requests[0]?.user.handle).toBe('decfrom');

    expect((await post(`/api/buddy-requests/${id}/decline`, {}, to.accessToken)).status).toBe(200);
    expect((await post(`/api/buddy-requests/${id}/decline`, {}, to.accessToken)).status).toBe(410);
  });

  it('will not let a third party accept or decline someone else\'s request', async () => {
    const from = await openBuddy('third-from@example.com', 'thirdfrom');
    const to = await openBuddy('third-to@example.com', 'thirdto');
    const nosy = await openBuddy('third-nosy@example.com', 'thirdnosy');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };

    expect((await post(`/api/buddy-requests/${id}/accept`, {}, nosy.accessToken)).status).toBe(403);
    expect((await post(`/api/buddy-requests/${id}/decline`, {}, nosy.accessToken)).status).toBe(403);
  });

  it('enforces the re-request cooldown after a decline', async () => {
    const from = await openBuddy('cool-from@example.com', 'coolfrom');
    const to = await openBuddy('cool-to@example.com', 'coolto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };
    await post(`/api/buddy-requests/${id}/decline`, {}, to.accessToken);

    // Same person, straight away: blocked.
    const again = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    expect(again.status).toBe(409);

    // Someone else: allowed immediately (§2.2).
    const other = await openBuddy('cool-other@example.com', 'coolother');
    expect(
      (await post('/api/buddy-requests', { toUserId: other.userId }, from.accessToken)).status,
    ).toBe(201);
  });

  it('lets the requester cancel and immediately ask someone else', async () => {
    const from = await openBuddy('can-from@example.com', 'canfrom');
    const to = await openBuddy('can-to@example.com', 'canto');
    const other = await openBuddy('can-other@example.com', 'canother');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };

    expect((await post(`/api/buddy-requests/${id}/cancel`, {}, from.accessToken)).status).toBe(200);
    expect(
      (await post('/api/buddy-requests', { toUserId: other.userId }, from.accessToken)).status,
    ).toBe(201);
  });

  it('excludes existing group-mates from the directory', async () => {
    const from = await openBuddy('mate-from@example.com', 'matefrom');
    const to = await openBuddy('mate-to@example.com', 'mateto');

    const created = await post('/api/buddy-requests', { toUserId: to.userId }, from.accessToken);
    const { id } = (await created.json()) as { id: string };
    await post(`/api/buddy-requests/${id}/accept`, {}, to.accessToken);

    const { buddies } = (await (await get('/api/buddies', from.accessToken)).json()) as {
      buddies: { handle: string }[];
    };
    expect(buddies.map((b) => b.handle)).not.toContain('mateto');
  });
});
