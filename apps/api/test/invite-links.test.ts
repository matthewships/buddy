import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { del, get, onboard, pair, post, resetRateLimits, signUp } from './helpers.js';

beforeEach(resetRateLimits);

async function mintLink(session: { accessToken: string }, groupId: string): Promise<string> {
  const res = await post(`/api/groups/${groupId}/invite-links`, {}, session.accessToken);
  expect(res.status).toBe(201);
  return (await res.json() as { token: string }).token;
}

describe('invite links', () => {
  it('previews the group without a session at all', async () => {
    // The whole point: someone arriving from WhatsApp has no account yet, and
    // asking them to sign up before saying what they are joining loses them.
    const { owner, groupId } = await pair('preview');
    const token = await mintLink(owner, groupId);

    const res = await get(`/api/invite-links/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { group: { name: string }; invitedBy: string };
    expect(body.group.name).toContain('preview');
    expect(body.invitedBy).toBeTruthy();
  });

  it('does not disclose the member list', async () => {
    // A leaked link grants entry; it should not also be a roster.
    const { owner, groupId } = await pair('noroster');
    const token = await mintLink(owner, groupId);

    const body = (await (await get(`/api/invite-links/${token}`)).json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
    expect(body.members).toBeUndefined();
  });

  it('lets a brand-new account join through it', async () => {
    const { owner, groupId } = await pair('newjoiner');
    const token = await mintLink(owner, groupId);

    // Registers and onboards exactly as the web signup flow does, then redeems.
    const joiner = await signUp('link-joiner@example.com');
    await onboard(joiner, 'linkjoiner');

    const res = await post(`/api/invite-links/${token}/accept`, {}, joiner.accessToken);
    expect(res.status).toBe(200);
    expect((await res.json() as { joined: boolean }).joined).toBe(true);

    const members = (await (await get(`/api/groups/${groupId}`, joiner.accessToken)).json()) as {
      members: { handle: string }[];
    };
    expect(members.members.map((m) => m.handle)).toContain('linkjoiner');
  });

  it('is idempotent for someone already in the group', async () => {
    const { owner, groupId } = await pair('rejoin');
    const token = await mintLink(owner, groupId);

    const res = await post(`/api/invite-links/${token}/accept`, {}, owner.accessToken);
    expect(res.status).toBe(200);
    expect((await res.json() as { joined: boolean }).joined).toBe(false);
  });

  it('stops working once revoked', async () => {
    const { owner, groupId } = await pair('revoked');
    const token = await mintLink(owner, groupId);
    const { results } = await env.DB.prepare(
      'SELECT id FROM group_invite_links WHERE token = ?',
    )
      .bind(token)
      .all<{ id: string }>();

    await del(`/api/groups/${groupId}/invite-links/${results[0]!.id}`, owner.accessToken);
    expect((await get(`/api/invite-links/${token}`)).status).toBe(410);
  });

  it('stops working once expired', async () => {
    const { owner, groupId } = await pair('expired');
    const token = await mintLink(owner, groupId);
    await env.DB.prepare('UPDATE group_invite_links SET expires_at = ? WHERE token = ?')
      .bind('2020-01-01T00:00:00.000Z', token)
      .run();

    expect((await get(`/api/invite-links/${token}`)).status).toBe(410);
  });

  it('stops working once used up', async () => {
    const { owner, groupId } = await pair('usedup');
    const token = await mintLink(owner, groupId);
    await env.DB.prepare('UPDATE group_invite_links SET uses = max_uses WHERE token = ?')
      .bind(token)
      .run();

    expect((await get(`/api/invite-links/${token}`)).status).toBe(410);
    const joiner = await signUp('usedup-joiner@example.com');
    await onboard(joiner, 'usedupjoiner');
    expect((await post(`/api/invite-links/${token}/accept`, {}, joiner.accessToken)).status).toBe(
      410,
    );
  });

  it('rejects a token that was never minted', async () => {
    expect((await get('/api/invite-links/aaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
  });

  it('mints tokens nobody could guess from another', async () => {
    // Ids are ULIDs and sort by creation time, which is exactly why the token is
    // not one: two links minted seconds apart must not be near each other.
    const { owner, groupId } = await pair('unguessable');
    const a = await mintLink(owner, groupId);
    const b = await mintLink(owner, groupId);

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    const shared = [...a].filter((ch, i) => ch === b[i]).length;
    expect(shared).toBeLessThan(a.length / 2);
  });
});
