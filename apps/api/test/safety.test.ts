import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { SELF } from 'cloudflare:test';

import { BASE, del, get, onboard, pair, patch, post, resetRateLimits, signUp } from './helpers.js';
import { dropQuietRecipients } from '../src/services/push.js';
import { db } from '../src/db/client.js';

beforeEach(resetRateLimits);

/** Makes somebody visible in the directory. */
async function openBuddy(token: string) {
  const res = await patch('/api/me', { isOpenBuddy: true }, token);
  expect(res.status).toBe(200);
}

async function directoryIds(token: string): Promise<string[]> {
  const res = await get('/api/buddies', token);
  expect(res.status).toBe(200);
  const { buddies } = (await res.json()) as { buddies: { id: string }[] };
  return buddies.map((b) => b.id);
}

async function setBirthDate(userId: string, date: string | null) {
  await env.DB.prepare('UPDATE users SET date_of_birth = ? WHERE id = ?').bind(date, userId).run();
}

describe('blocking (PRODUCT.md §6.1)', () => {
  it('removes both people from each other’s directory, profile and requests', async () => {
    const a = await signUp('block-a@example.com');
    await onboard(a, 'blocka');
    const b = await signUp('block-b@example.com');
    await onboard(b, 'blockb');
    await openBuddy(a.accessToken);
    await openBuddy(b.accessToken);

    expect(await directoryIds(a.accessToken)).toContain(b.userId);
    expect(await directoryIds(b.accessToken)).toContain(a.userId);

    const blocked = await post('/api/users/blockb/block', {}, a.accessToken);
    expect(blocked.status).toBe(200);

    // Mutual in effect, though only one row was written.
    expect(await directoryIds(a.accessToken)).not.toContain(b.userId);
    expect(await directoryIds(b.accessToken)).not.toContain(a.userId);

    // Profiles read as absence in both directions.
    expect((await get('/api/users/blockb', a.accessToken)).status).toBe(404);
    expect((await get('/api/users/blocka', b.accessToken)).status).toBe(404);

    // A request from the blocked side reads as absence too, never as "blocked".
    const req = await post('/api/buddy-requests', { toUserId: a.userId }, b.accessToken);
    expect(req.status).toBe(404);

    // Only the blocker can undo it.
    expect((await del('/api/users/blocka/block', b.accessToken)).status).toBe(200);
    expect(await directoryIds(b.accessToken)).not.toContain(a.userId);
    expect((await del('/api/users/blockb/block', a.accessToken)).status).toBe(200);
    expect(await directoryIds(b.accessToken)).toContain(a.userId);
  });

  it('lists what the caller has blocked, and refuses self', async () => {
    const a = await signUp('block-list-a@example.com');
    await onboard(a, 'blocklista');
    const b = await signUp('block-list-b@example.com');
    await onboard(b, 'blocklistb');

    expect((await post('/api/users/blocklista/block', {}, a.accessToken)).status).toBe(400);
    await post('/api/users/blocklistb/block', {}, a.accessToken);

    const res = await get('/api/me/blocks', a.accessToken);
    const { blocks } = (await res.json()) as { blocks: { handle: string }[] };
    expect(blocks.map((b) => b.handle)).toEqual(['blocklistb']);
  });

  it('expires a pending request between the two and leaves a shared matched group', async () => {
    const a = await signUp('block-req-a@example.com');
    await onboard(a, 'blockreqa');
    const b = await signUp('block-req-b@example.com');
    await onboard(b, 'blockreqb');
    await openBuddy(b.accessToken);

    const sent = await post('/api/buddy-requests', { toUserId: b.userId }, a.accessToken);
    expect(sent.status).toBe(201);

    await post('/api/users/blockreqa/block', {}, b.accessToken);

    const current = (await (await get('/api/buddy-requests/current', a.accessToken)).json()) as {
      request: unknown;
      outcome: { status: string } | null;
    };
    expect(current.request).toBeNull();
    expect(current.outcome?.status).toBe('expired');
  });

  it('hides a blocked author from the feed and collapses their chat history', async () => {
    const { owner, buddy, groupId, buddyHandle } = await pair('block-feed');

    const posted = await post('/api/posts', { caption: 'finished chapter four' }, buddy.accessToken);
    expect(posted.status).toBe(201);
    await env.DB.prepare(
      "INSERT INTO messages (id, group_id, sender_id, body) VALUES ('01MSGBLOCKTEST0000000000AA', ?, ?, 'hello')",
    )
      .bind(groupId, buddy.userId)
      .run();

    const before = (await (await get('/api/posts', owner.accessToken)).json()) as {
      posts: { author: { handle: string } }[];
    };
    expect(before.posts.some((p) => p.author.handle === buddyHandle)).toBe(true);

    await post(`/api/users/${buddyHandle}/block`, {}, owner.accessToken);

    const after = (await (await get('/api/posts', owner.accessToken)).json()) as {
      posts: { author: { handle: string } }[];
    };
    expect(after.posts.some((p) => p.author.handle === buddyHandle)).toBe(false);

    const history = (await (await get(`/api/groups/${groupId}/messages`, owner.accessToken)).json()) as {
      messages: { body: string; blocked: boolean }[];
    };
    expect(history.messages).toHaveLength(1);
    expect(history.messages[0]).toMatchObject({ body: '', blocked: true });

    // The blocked person cannot be invited by handle either.
    const invite = await post(`/api/groups/${groupId}/invites`, { handle: buddyHandle }, owner.accessToken);
    expect(invite.status).toBe(404);
  });
});

describe('the adult line (PRODUCT.md §6.3)', () => {
  it('shows minors only to minors and adults only to adults; unknown ages count as adult', async () => {
    const minor = await signUp('age-minor@example.com');
    await onboard(minor, 'ageminor');
    const adult = await signUp('age-adult@example.com');
    await onboard(adult, 'ageadult');
    const unknown = await signUp('age-unknown@example.com');
    await onboard(unknown, 'ageunknown');
    for (const s of [minor, adult, unknown]) await openBuddy(s.accessToken);

    const year = new Date().getUTCFullYear();
    await setBirthDate(minor.userId, `${year - 17}-01-01`);
    await setBirthDate(adult.userId, `${year - 30}-01-01`);
    await setBirthDate(unknown.userId, null);

    const seenByMinor = await directoryIds(minor.accessToken);
    expect(seenByMinor).not.toContain(adult.userId);
    expect(seenByMinor).not.toContain(unknown.userId);

    const seenByAdult = await directoryIds(adult.accessToken);
    expect(seenByAdult).not.toContain(minor.userId);
    expect(seenByAdult).toContain(unknown.userId);

    // A request across the line reads as absence.
    const req = await post('/api/buddy-requests', { toUserId: minor.userId }, adult.accessToken);
    expect(req.status).toBe(404);
  });
});

describe('muting and leaving (PRODUCT.md §6.1)', () => {
  it('records a mute on the group and reports it back', async () => {
    const { owner, groupId } = await pair('mute');
    expect((await post(`/api/groups/${groupId}/mute`, {}, owner.accessToken)).status).toBe(200);
    let detail = (await (await get(`/api/groups/${groupId}`, owner.accessToken)).json()) as {
      group: { muted: boolean };
    };
    expect(detail.group.muted).toBe(true);
    expect((await del(`/api/groups/${groupId}/mute`, owner.accessToken)).status).toBe(200);
    detail = (await (await get(`/api/groups/${groupId}`, owner.accessToken)).json()) as {
      group: { muted: boolean };
    };
    expect(detail.group.muted).toBe(false);
  });

  it('keeps the reason for leaving after the member is gone', async () => {
    const { buddy, groupId } = await pair('leave-reason');
    const res = await post(
      `/api/groups/${groupId}/leave`,
      { reason: 'pressure', note: 'too many pings' },
      buddy.accessToken,
    );
    expect(res.status).toBe(200);

    const { results } = await env.DB.prepare(
      'SELECT reason, note FROM group_departures WHERE group_id = ? AND user_id = ?',
    )
      .bind(groupId, buddy.userId)
      .all<{ reason: string; note: string }>();
    expect(results[0]).toMatchObject({ reason: 'pressure', note: 'too many pings' });
  });

  it('still accepts leaving with no body, as the mobile app sends it', async () => {
    const { buddy, groupId } = await pair('leave-plain');
    // Exactly what the Expo client sends: no body, no content-type, only auth.
    const res = await SELF.fetch(`${BASE}/api/groups/${groupId}/leave`, {
      method: 'POST',
      headers: { authorization: `Bearer ${buddy.accessToken}` },
    });
    expect(res.status).toBe(200);
  });

  it('records a departure when a block leaves a shared matched group', async () => {
    const a = await signUp('block-matched-a@example.com');
    await onboard(a, 'blockmatcheda');
    const b = await signUp('block-matched-b@example.com');
    await onboard(b, 'blockmatchedb');
    await openBuddy(b.accessToken);
    await post('/api/buddy-requests', { toUserId: b.userId }, a.accessToken);
    const incoming = (await (await get('/api/buddy-requests/incoming', b.accessToken)).json()) as {
      requests: { id: string }[];
    };
    const accepted = await post(`/api/buddy-requests/${incoming.requests[0]!.id}/accept`, {}, b.accessToken);
    expect(accepted.status).toBe(201);
    const { group } = (await accepted.json()) as { group: { id: string } };

    const blocked = (await (await post('/api/users/blockmatchedb/block', {}, a.accessToken)).json()) as {
      leftGroups: number;
    };
    expect(blocked.leftGroups).toBe(1);
    expect((await get(`/api/groups/${group.id}`, a.accessToken)).status).toBe(403);

    const { results } = await env.DB.prepare(
      'SELECT reason FROM group_departures WHERE group_id = ? AND user_id = ?',
    )
      .bind(group.id, a.userId)
      .all<{ reason: string }>();
    expect(results[0]?.reason).toBe('person');
  });
});

describe('quiet hours (PRODUCT.md §5.3)', () => {
  it('are stored as a pair and read back', async () => {
    const a = await signUp('quiet-a@example.com');
    await onboard(a, 'quieta');
    expect((await patch('/api/me', { quietHoursStart: 22 }, a.accessToken)).status).toBe(400);
    const res = await patch('/api/me', { quietHoursStart: 22, quietHoursEnd: 8 }, a.accessToken);
    expect(res.status).toBe(200);
    const me = (await (await get('/api/me', a.accessToken)).json()) as {
      quietHoursStart: number;
      quietHoursEnd: number;
    };
    expect(me).toMatchObject({ quietHoursStart: 22, quietHoursEnd: 8 });
  });

  it('drop a nudge for a recipient inside their window, and nothing else', async () => {
    const a = await signUp('quiet-drop@example.com');
    await onboard(a, 'quietdrop');
    // A window covering the whole day, so the test does not depend on the clock.
    await env.DB.prepare('UPDATE users SET quiet_hours_start = 0, quiet_hours_end = 23 WHERE id = ?')
      .bind(a.userId)
      .run();
    const hour = new Date().getUTCHours();
    if (hour === 23) {
      await env.DB.prepare('UPDATE users SET quiet_hours_start = 1, quiet_hours_end = 0 WHERE id = ?')
        .bind(a.userId)
        .run();
    }

    const out = await dropQuietRecipients(db(env.DB), [
      { userIds: [a.userId], title: 'n', body: 'b', data: { type: 'daily_nudge' } },
      { userIds: [a.userId], title: 'c', body: 'b', data: { type: 'chat_message' } },
    ]);
    expect(out[0]!.userIds).toEqual([]);
    expect(out[1]!.userIds).toEqual([a.userId]);
  });
});
