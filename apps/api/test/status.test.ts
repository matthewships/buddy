import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { get, pair, put, resetRateLimits } from './helpers.js';

beforeEach(resetRateLimits);

async function setTimezone(userId: string, timezone: string) {
  await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(timezone, userId).run();
}

/** Winds a stored status back a day, standing in for the passage of midnight. */
async function backdateStatus(userId: string, date: string) {
  await env.DB.prepare('UPDATE users SET status_date = ? WHERE id = ?').bind(date, userId).run();
}

async function myStatus(token: string): Promise<string | null> {
  const res = await get('/api/me', token);
  expect(res.status).toBe(200);
  return ((await res.json()) as { statusKey: string | null }).statusKey;
}

async function statusOf(groupId: string, token: string, userId: string): Promise<string | null> {
  const res = await get(`/api/groups/${groupId}`, token);
  expect(res.status).toBe(200);
  const { members } = (await res.json()) as {
    members: { id: string; statusKey: string | null }[];
  };
  return members.find((m) => m.id === userId)!.statusKey;
}

describe('setting today’s status', () => {
  it('stores it and reads it straight back', async () => {
    const { owner } = await pair('stset');

    const res = await put('/api/me/status', { statusKey: 'stuck' }, owner.accessToken);
    expect(res.status).toBe(200);
    expect(await myStatus(owner.accessToken)).toBe('stuck');
  });

  it('clears it when set to null', async () => {
    const { owner } = await pair('stclear');
    await put('/api/me/status', { statusKey: 'on_a_roll' }, owner.accessToken);

    const res = await put('/api/me/status', { statusKey: null }, owner.accessToken);
    expect(res.status).toBe(200);
    expect(await myStatus(owner.accessToken)).toBeNull();
  });

  it('refuses a key that is not on the list', async () => {
    const { owner } = await pair('stbad');
    const res = await put('/api/me/status', { statusKey: 'vibing' }, owner.accessToken);
    expect(res.status).toBe(400);
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await put('/api/me/status', { statusKey: 'stuck' });
    expect(res.status).toBe(401);
  });

  it('stamps the day itself rather than trusting the client', async () => {
    const { owner } = await pair('stday');
    // The schema has no date field at all, so a client cannot send one.
    await put(
      '/api/me/status',
      { statusKey: 'stuck', statusDate: '2020-01-01' },
      owner.accessToken,
    );

    const { results } = await env.DB.prepare('SELECT status_date FROM users WHERE id = ?')
      .bind(owner.userId)
      .all<{ status_date: string }>();
    expect(results[0]!.status_date).not.toBe('2020-01-01');
    expect(await myStatus(owner.accessToken)).toBe('stuck');
  });
});

describe('a status and its own day', () => {
  it('is gone the next day, without anything having to sweep it', async () => {
    const { owner } = await pair('stexpire');
    await put('/api/me/status', { statusKey: 'need_a_push' }, owner.accessToken);
    expect(await myStatus(owner.accessToken)).toBe('need_a_push');

    await backdateStatus(owner.userId, '2020-01-01');
    expect(await myStatus(owner.accessToken)).toBeNull();
  });

  it('is measured against the setter’s own timezone, not the reader’s', async () => {
    const { owner, buddy, groupId } = await pair('sttz');
    await setTimezone(owner.userId, 'Pacific/Kiritimati');
    await setTimezone(buddy.userId, 'Pacific/Niue');

    // Set in the far-eastern zone, where the local day is ahead of everybody.
    await put('/api/me/status', { statusKey: 'heads_down' }, owner.accessToken);

    // The buddy is up to a day behind, and still sees it: the comparison uses
    // the owner's day, not theirs.
    expect(await statusOf(groupId, buddy.accessToken, owner.userId)).toBe('heads_down');
  });
});

describe('what the group sees', () => {
  it('shows a member’s status to the rest of the group', async () => {
    const { owner, buddy, groupId } = await pair('stgroup');
    await put('/api/me/status', { statusKey: 'slow_start' }, owner.accessToken);

    expect(await statusOf(groupId, buddy.accessToken, owner.userId)).toBe('slow_start');
  });

  it('shows null for a member who has set nothing', async () => {
    const { owner, buddy, groupId } = await pair('stgroupnone');
    expect(await statusOf(groupId, owner.accessToken, buddy.userId)).toBeNull();
  });

  it('never leaks the timezone or the stored date it was worked out from', async () => {
    const { owner, buddy, groupId } = await pair('stgroupleak');
    await put('/api/me/status', { statusKey: 'stuck' }, owner.accessToken);

    const res = await get(`/api/groups/${groupId}`, buddy.accessToken);
    const { members } = (await res.json()) as { members: Record<string, unknown>[] };
    const them = members.find((m) => m.id === owner.userId)!;
    expect(them).not.toHaveProperty('timezone');
    expect(them).not.toHaveProperty('statusDate');
  });
});
