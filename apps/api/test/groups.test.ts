import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { get, onboard, post, resetRateLimits, signUp, type Session } from './helpers.js';

beforeEach(resetRateLimits);

async function member(email: string, handle: string): Promise<Session> {
  const session = await signUp(email);
  await onboard(session, handle);
  return session;
}

async function createGroup(session: Session, name = 'Study crew') {
  const res = await post('/api/groups', { name, emoji: '📚' }, session.accessToken);
  expect(res.status).toBe(201);
  const { group } = (await res.json()) as { group: { id: string; name: string } };
  return group;
}

describe('groups', () => {
  it('creates a group with the creator as owner', async () => {
    const owner = await member('g-owner@example.com', 'gowner');
    const group = await createGroup(owner);

    const body = (await (await get(`/api/groups/${group.id}`, owner.accessToken)).json()) as {
      group: { kind: string };
      members: { handle: string; role: string }[];
    };
    expect(body.group.kind).toBe('friends');
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({ handle: 'gowner', role: 'owner' });
  });

  it('hides a group from non-members', async () => {
    const owner = await member('g-in@example.com', 'gin');
    const outsider = await member('g-out@example.com', 'gout');
    const group = await createGroup(owner);

    expect((await get(`/api/groups/${group.id}`, outsider.accessToken)).status).toBe(403);
    const { groups } = (await (await get('/api/groups', outsider.accessToken)).json()) as {
      groups: unknown[];
    };
    expect(groups).toHaveLength(0);
  });
});

describe('group invites', () => {
  it('invites by handle, and the invitee can accept', async () => {
    const owner = await member('i-owner@example.com', 'iowner');
    const friend = await member('i-friend@example.com', 'ifriend');
    const group = await createGroup(owner);

    const invited = await post(
      `/api/groups/${group.id}/invites`,
      { handle: 'ifriend' },
      owner.accessToken,
    );
    expect(invited.status).toBe(201);

    const { invites } = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: { id: string; groupName: string; fromHandle: string }[];
    };
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ groupName: 'Study crew', fromHandle: 'iowner' });

    const accepted = await post(
      `/api/invites/${invites[0]!.id}/accept`,
      {},
      friend.accessToken,
    );
    expect(accepted.status).toBe(200);

    const body = (await (await get(`/api/groups/${group.id}`, friend.accessToken)).json()) as {
      members: { handle: string }[];
    };
    expect(body.members.map((m) => m.handle).sort()).toEqual(['ifriend', 'iowner']);
  });

  it('refuses an unknown handle', async () => {
    const owner = await member('i-unknown@example.com', 'iunknown');
    const group = await createGroup(owner);
    const res = await post(
      `/api/groups/${group.id}/invites`,
      { handle: 'nobodyatall' },
      owner.accessToken,
    );
    expect(res.status).toBe(404);
  });

  it('refuses a duplicate pending invite and an existing member', async () => {
    const owner = await member('i-dup-owner@example.com', 'idupowner');
    const friend = await member('i-dup-friend@example.com', 'idupfriend');
    const group = await createGroup(owner);

    expect(
      (await post(`/api/groups/${group.id}/invites`, { handle: 'idupfriend' }, owner.accessToken))
        .status,
    ).toBe(201);
    // Second invite while one is outstanding.
    expect(
      (await post(`/api/groups/${group.id}/invites`, { handle: 'idupfriend' }, owner.accessToken))
        .status,
    ).toBe(409);

    const { invites } = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: { id: string }[];
    };
    await post(`/api/invites/${invites[0]!.id}/accept`, {}, friend.accessToken);

    // Now they're a member.
    expect(
      (await post(`/api/groups/${group.id}/invites`, { handle: 'idupfriend' }, owner.accessToken))
        .status,
    ).toBe(409);
  });

  it('only members can invite', async () => {
    const owner = await member('i-perm-owner@example.com', 'ipermowner');
    const outsider = await member('i-perm-out@example.com', 'ipermout');
    const target = await member('i-perm-target@example.com', 'ipermtarget');
    const group = await createGroup(owner);

    const res = await post(
      `/api/groups/${group.id}/invites`,
      { handle: 'ipermtarget' },
      outsider.accessToken,
    );
    expect(res.status).toBe(403);
    expect(target.userId).toBeTruthy();
  });

  it('expires an invite after 7 days and refuses to accept it', async () => {
    const owner = await member('i-exp-owner@example.com', 'iexpowner');
    const friend = await member('i-exp-friend@example.com', 'iexpfriend');
    const group = await createGroup(owner);

    await post(`/api/groups/${group.id}/invites`, { handle: 'iexpfriend' }, owner.accessToken);
    const { invites } = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: { id: string }[];
    };
    const inviteId = invites[0]!.id;

    await env.DB.prepare('UPDATE group_invites SET expires_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), inviteId)
      .run();

    // The lazy sweep drops it from the list...
    const after = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: unknown[];
    };
    expect(after.invites).toHaveLength(0);

    // ...and accepting it is refused rather than silently working.
    expect((await post(`/api/invites/${inviteId}/accept`, {}, friend.accessToken)).status).toBe(410);
  });

  it('lets the invitee decline, and declining twice is refused', async () => {
    const owner = await member('i-dec-owner@example.com', 'idecowner');
    const friend = await member('i-dec-friend@example.com', 'idecfriend');
    const group = await createGroup(owner);

    await post(`/api/groups/${group.id}/invites`, { handle: 'idecfriend' }, owner.accessToken);
    const { invites } = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: { id: string }[];
    };
    const id = invites[0]!.id;

    expect((await post(`/api/invites/${id}/decline`, {}, friend.accessToken)).status).toBe(200);
    expect((await post(`/api/invites/${id}/decline`, {}, friend.accessToken)).status).toBe(410);
  });

  it('will not let a third party accept an invite addressed to someone else', async () => {
    const owner = await member('i-3-owner@example.com', 'i3owner');
    const friend = await member('i-3-friend@example.com', 'i3friend');
    const nosy = await member('i-3-nosy@example.com', 'i3nosy');
    const group = await createGroup(owner);

    await post(`/api/groups/${group.id}/invites`, { handle: 'i3friend' }, owner.accessToken);
    const { invites } = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: { id: string }[];
    };

    expect(
      (await post(`/api/invites/${invites[0]!.id}/accept`, {}, nosy.accessToken)).status,
    ).toBe(403);
  });
});

describe('leaving a group', () => {
  it('removes the member and keeps the group while others remain', async () => {
    const owner = await member('l-owner@example.com', 'lowner');
    const friend = await member('l-friend@example.com', 'lfriend');
    const group = await createGroup(owner);

    await post(`/api/groups/${group.id}/invites`, { handle: 'lfriend' }, owner.accessToken);
    const { invites } = (await (await get('/api/invites', friend.accessToken)).json()) as {
      invites: { id: string }[];
    };
    await post(`/api/invites/${invites[0]!.id}/accept`, {}, friend.accessToken);

    const left = await post(`/api/groups/${group.id}/leave`, {}, friend.accessToken);
    await expect(left.json()).resolves.toMatchObject({ groupDeleted: false });

    // Still visible to the remaining member, gone for the one who left.
    expect((await get(`/api/groups/${group.id}`, owner.accessToken)).status).toBe(200);
    expect((await get(`/api/groups/${group.id}`, friend.accessToken)).status).toBe(403);
  });

  it('deletes the group when the last member leaves', async () => {
    const owner = await member('l-last@example.com', 'llast');
    const group = await createGroup(owner);

    const left = await post(`/api/groups/${group.id}/leave`, {}, owner.accessToken);
    await expect(left.json()).resolves.toMatchObject({ groupDeleted: true });

    const { results } = await env.DB.prepare('SELECT count(*) AS n FROM groups WHERE id = ?')
      .bind(group.id)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(0);
  });
});
