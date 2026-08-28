import { DurableObject } from 'cloudflare:workers';
import { and, eq, ne } from 'drizzle-orm';

import { MAX_MESSAGE_BODY, sendMessageSchema } from '@buddy/shared';

import { db } from '../db/client.js';
import { groupMembers, messages } from '../db/schema.js';
import type { Env } from '../env.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { enqueuePush } from '../services/push.js';

/**
 * One chat room per group (§4.7).
 *
 * **D1 remains the source of truth.** The Durable Object only does live fan-out;
 * every message is written to D1 before it is broadcast. Keeping history in the
 * DO's own SQLite would be faster but would make moderation impossible — reports
 * need to query messages across all groups (§1, considered and rejected).
 *
 * **Hibernation.** Sockets are accepted with `ctx.acceptWebSocket`, so the object
 * is evicted from memory while idle and costs almost nothing. Two consequences
 * shape the code: the constructor must stay cheap because it runs again on every
 * wake, and per-connection identity cannot live in an instance field — it is
 * attached to the socket itself via `serializeAttachment`.
 */

/**
 * Attached to each socket rather than held in an instance field: hibernation
 * discards the instance, but attachments survive it. The group id lives here
 * too, so a woken object knows which room it is without any stored state.
 */
interface SocketIdentity {
  groupId: string;
  userId: string;
  displayName: string;
  handle: string;
}

type Outbound =
  | { type: 'message'; message: BroadcastMessage }
  | { type: 'presence'; connected: number }
  | { type: 'error'; message: string };

interface BroadcastMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderHandle: string;
  senderDisplayName: string;
  body: string;
  createdAt: string;
}

export class GroupChat extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answers protocol pings without waking the object, so a client keepalive
    // does not defeat hibernation.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /**
   * Accepts the upgrade. The Worker has already verified the ticket and the
   * caller's membership, and passes the identity along — the DO is not
   * reachable from outside the Worker.
   */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const identity: SocketIdentity = {
      groupId: url.searchParams.get('groupId') ?? '',
      userId: url.searchParams.get('userId') ?? '',
      displayName: url.searchParams.get('displayName') ?? '',
      handle: url.searchParams.get('handle') ?? '',
    };
    if (!identity.userId || !identity.groupId) {
      return new Response('Missing identity', { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    // Survives hibernation, unlike an instance field.
    server.serializeAttachment(identity);

    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const identity = ws.deserializeAttachment() as SocketIdentity | null;
    if (!identity?.userId) {
      ws.close(1008, 'Unidentified connection');
      return;
    }

    if (typeof raw !== 'string') {
      this.send(ws, { type: 'error', message: 'Only text messages are supported' });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.send(ws, { type: 'error', message: 'Malformed message' });
      return;
    }

    const parsed = sendMessageSchema.safeParse(payload);
    if (!parsed.success) {
      this.send(ws, {
        type: 'error',
        message: `A message must be 1-${MAX_MESSAGE_BODY} characters`,
      });
      return;
    }

    const { groupId } = identity;
    const client = db(this.env.DB);

    /**
     * Re-check membership on every message rather than trusting the handshake.
     * A socket can outlive a removal — someone leaving a group must stop being
     * able to post to it immediately, not whenever their connection drops.
     */
    const membership = await client.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, identity.userId)),
    });
    if (!membership) {
      this.send(ws, { type: 'error', message: 'You are no longer in this group' });
      ws.close(1008, 'Not a member');
      return;
    }

    const message: BroadcastMessage = {
      id: newId(),
      groupId,
      senderId: identity.userId,
      senderHandle: identity.handle,
      senderDisplayName: identity.displayName,
      body: parsed.data.body,
      createdAt: nowIso(),
    };

    // D1 first: a message that is broadcast but not stored would vanish on
    // reload and could never be moderated.
    await client.insert(messages).values({
      id: message.id,
      groupId,
      senderId: identity.userId,
      body: message.body,
      createdAt: message.createdAt,
    });

    this.broadcast({ type: 'message', message });

    // Push only to members who are not currently connected — notifying someone
    // who is looking at the message is noise.
    const connectedIds = new Set(
      this.ctx
        .getWebSockets()
        .map((socket) => (socket.deserializeAttachment() as SocketIdentity | null)?.userId)
        .filter((id): id is string => Boolean(id)),
    );

    const absent = (
      await client
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, identity.userId)))
    )
      .map((row) => row.userId)
      .filter((id) => !connectedIds.has(id));

    await enqueuePush(this.env, {
      userIds: absent,
      title: identity.displayName,
      body: message.body.slice(0, 140),
      data: { type: 'chat_message', groupId, url: `/groups/${groupId}/chat` },
    });
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // The runtime auto-replies to close frames on current compatibility dates,
    // so this only needs to update presence for everyone else.
    void ws;
    void code;
    void reason;
    this.broadcastPresence();
  }

  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[chat] socket error', error);
    ws.close(1011, 'Socket error');
  }

  /**
   * Disconnects a member who has been removed from the group. Called by the
   * Worker when membership changes, so a removed member's socket does not linger
   * until they happen to close the app (§4.7).
   */
  async disconnectMember(userId: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      const identity = socket.deserializeAttachment() as SocketIdentity | null;
      if (identity?.userId === userId) {
        socket.close(1008, 'Removed from group');
      }
    }
    this.broadcastPresence();
  }

  private broadcast(payload: Outbound): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(encoded);
      } catch {
        // A socket that died between getWebSockets() and send() is not an error.
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', connected: this.ctx.getWebSockets().length });
  }

  private send(ws: WebSocket, payload: Outbound): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore: the connection is already gone.
    }
  }
}
