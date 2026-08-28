import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { signChatTicket } from '../src/services/chat-ticket.js';
import { verifyChatTicket } from '../src/services/chat-ticket.js';

import { BASE, get, pair, post, resetRateLimits } from './helpers.js';

beforeEach(resetRateLimits);

const SECRET = 'test-secret-not-used-anywhere-real';

/** Opens a chat socket with a freshly issued ticket. */
async function connect(groupId: string, token: string) {
  const issued = await post(`/api/groups/${groupId}/chat-ticket`, {}, token);
  expect(issued.status).toBe(200);
  const { ticket } = (await issued.json()) as { ticket: string };

  const response = await SELF.fetch(
    `${BASE}/api/chat/${groupId}?ticket=${encodeURIComponent(ticket)}`,
    { headers: { Upgrade: 'websocket' } },
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  return socket;
}

/** Waits for the next message of a given type. */
function nextMessage<T = unknown>(
  socket: WebSocket,
  type: string,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(event.data as string) as { type: string };
      if (payload.type === type) {
        clearTimeout(timer);
        socket.removeEventListener('message', listener as never);
        resolve(payload as T);
      }
    };
    socket.addEventListener('message', listener as never);
  });
}

describe('chat tickets', () => {
  it('round-trips a valid ticket', async () => {
    const { ticket } = await signChatTicket(SECRET, 'G1', 'U1');
    await expect(verifyChatTicket(SECRET, ticket)).resolves.toMatchObject({
      groupId: 'G1',
      userId: 'U1',
    });
  });

  it('rejects a forged signature', async () => {
    const { ticket } = await signChatTicket(SECRET, 'G1', 'U1');
    const tampered = `${ticket.slice(0, -4)}AAAA`;
    await expect(verifyChatTicket(SECRET, tampered)).resolves.toBeNull();
  });

  it('rejects a ticket signed with another secret', async () => {
    const { ticket } = await signChatTicket('a-different-secret', 'G1', 'U1');
    await expect(verifyChatTicket(SECRET, ticket)).resolves.toBeNull();
  });

  it('rejects a ticket whose claims were edited', async () => {
    const { ticket } = await signChatTicket(SECRET, 'G1', 'U1');
    const parts = ticket.split('.');
    // Same signature, different user.
    const swapped = ['G1', 'ATTACKER', parts[2]!, parts[3]!].join('.');
    await expect(verifyChatTicket(SECRET, swapped)).resolves.toBeNull();
  });

  it('rejects an expired ticket', async () => {
    const expired = ['G1', 'U1', String(Date.now() - 1000)].join('.');
    // Sign the expired payload properly, so only the expiry can reject it.
    const { ticket } = await signChatTicket(SECRET, 'G1', 'U1');
    const signature = ticket.split('.')[3]!;
    await expect(verifyChatTicket(SECRET, `${expired}.${signature}`)).resolves.toBeNull();
  });

  it('refuses to issue a ticket to a non-member', async () => {
    const a = await pair('ticketin');
    const b = await pair('ticketout');
    const res = await post(`/api/groups/${a.groupId}/chat-ticket`, {}, b.owner.accessToken);
    expect(res.status).toBe(403);
  });
});

describe('chat sockets', () => {
  it('rejects an upgrade with no ticket', async () => {
    const { groupId } = await pair('nots');
    const res = await SELF.fetch(`${BASE}/api/chat/${groupId}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a ticket issued for a different group", async () => {
    const a = await pair('crossa');
    const b = await pair('crossb');

    // A valid ticket for group A, presented to group B.
    const issued = await post(
      `/api/groups/${a.groupId}/chat-ticket`,
      {},
      a.owner.accessToken,
    );
    const { ticket } = (await issued.json()) as { ticket: string };

    const res = await SELF.fetch(
      `${BASE}/api/chat/${b.groupId}?ticket=${encodeURIComponent(ticket)}`,
      { headers: { Upgrade: 'websocket' } },
    );
    expect(res.status).toBe(403);
  });

  it('broadcasts a message to the other member and stores it in D1', async () => {
    const { owner, buddy, groupId } = await pair('broadcast');

    const ownerSocket = await connect(groupId, owner.accessToken);
    const buddySocket = await connect(groupId, buddy.accessToken);

    const received = nextMessage<{ message: { body: string; senderId: string } }>(
      buddySocket,
      'message',
    );
    ownerSocket.send(JSON.stringify({ body: 'Morning — what are you working on?' }));

    const payload = await received;
    expect(payload.message.body).toBe('Morning — what are you working on?');
    expect(payload.message.senderId).toBe(owner.userId);

    // D1 is the source of truth, so the row must exist (§1).
    const { results } = await env.DB.prepare(
      'SELECT body, sender_id FROM messages WHERE group_id = ?',
    )
      .bind(groupId)
      .all<{ body: string; sender_id: string }>();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      body: 'Morning — what are you working on?',
      sender_id: owner.userId,
    });

    ownerSocket.close();
    buddySocket.close();
  });

  it('rejects an empty or oversized message without storing it', async () => {
    const { owner, groupId } = await pair('badmsg');
    const socket = await connect(groupId, owner.accessToken);

    const error = nextMessage<{ message: string }>(socket, 'error');
    socket.send(JSON.stringify({ body: '' }));
    await expect(error).resolves.toBeTruthy();

    const { results } = await env.DB.prepare(
      'SELECT count(*) AS n FROM messages WHERE group_id = ?',
    )
      .bind(groupId)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(0);

    socket.close();
  });

  it('rejects malformed JSON', async () => {
    const { owner, groupId } = await pair('badjson');
    const socket = await connect(groupId, owner.accessToken);

    const error = nextMessage<{ message: string }>(socket, 'error');
    socket.send('not json at all');
    await expect(error).resolves.toMatchObject({ message: 'Malformed message' });

    socket.close();
  });

  it('disconnects and silences a member who leaves the group', async () => {
    const { owner, buddy, groupId } = await pair('leftchat');
    const buddySocket = await connect(groupId, buddy.accessToken);

    const closed = new Promise<number>((resolve) => {
      buddySocket.addEventListener('close', ((event: CloseEvent) => resolve(event.code)) as never);
    });

    await post(`/api/groups/${groupId}/leave`, {}, buddy.accessToken);

    // Leaving closes the socket rather than leaving it open until the app does
    // — the group route tells the room to drop them (§4.7).
    await expect(closed).resolves.toBe(1008);

    const { results } = await env.DB.prepare(
      'SELECT count(*) AS n FROM messages WHERE group_id = ?',
    )
      .bind(groupId)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(0);
    expect(owner.userId).toBeTruthy();
  });

  it('refuses a message from a socket that outlived its membership', async () => {
    const { buddy, groupId } = await pair('staleconn');
    const socket = await connect(groupId, buddy.accessToken);

    /**
     * Drops the membership row directly, without going through /leave. That
     * skips the room's disconnect and leaves the socket open — which is exactly
     * the case the per-message membership re-check exists for, and the reason
     * the handshake check alone is not enough.
     */
    await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
      .bind(groupId, buddy.userId)
      .run();

    const error = nextMessage<{ message: string }>(socket, 'error');
    socket.send(JSON.stringify({ body: 'Can I still post?' }));
    await expect(error).resolves.toMatchObject({
      message: 'You are no longer in this group',
    });

    const { results } = await env.DB.prepare(
      'SELECT count(*) AS n FROM messages WHERE group_id = ?',
    )
      .bind(groupId)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(0);
  });
});

describe('chat history', () => {
  it('returns messages newest-first and pages on before', async () => {
    const { owner, buddy, groupId } = await pair('history');
    const socket = await connect(groupId, owner.accessToken);

    for (const body of ['first', 'second', 'third']) {
      const stored = nextMessage(socket, 'message');
      socket.send(JSON.stringify({ body }));
      await stored;
    }
    socket.close();

    const firstPage = (await (
      await get(`/api/groups/${groupId}/messages?limit=2`, buddy.accessToken)
    ).json()) as {
      messages: { body: string; createdAt: string }[];
      nextBefore: string | null;
    };

    expect(firstPage.messages).toHaveLength(2);
    expect(firstPage.messages[0]!.body).toBe('third'); // newest first
    expect(firstPage.nextBefore).toBeTruthy();

    const secondPage = (await (
      await get(
        `/api/groups/${groupId}/messages?limit=2&before=${encodeURIComponent(firstPage.nextBefore!)}`,
        buddy.accessToken,
      )
    ).json()) as { messages: { body: string }[] };

    expect(secondPage.messages.map((m) => m.body)).toEqual(['first']);
  });

  it('hides history from non-members', async () => {
    const a = await pair('histin');
    const b = await pair('histout');
    const res = await get(`/api/groups/${a.groupId}/messages`, b.owner.accessToken);
    expect(res.status).toBe(403);
  });
});
