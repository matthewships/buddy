import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { Hono } from 'hono';

import { listMessagesQuerySchema } from '@buddy/shared';

import { db } from '../db/client.js';
import { messages, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { currentUserId, requireAuth, requireSecret } from '../middleware/auth.js';
import { blockedIdsFor } from '../services/blocks.js';
import { signChatTicket, verifyChatTicket } from '../services/chat-ticket.js';
import { assertMember } from './groups.js';

/**
 * Group chat (§4.7).
 *
 * History is read over REST from D1 — the single source of truth — while live
 * fan-out goes through the Durable Object. The socket is authorised with a
 * 60-second ticket rather than the access token, because a WebSocket handshake
 * cannot carry an Authorization header and a 15-minute token in a query string
 * would end up in logs.
 */
/**
 * The WebSocket upgrade, mounted at `/api/chat/:id` rather than under
 * `/api/groups`.
 *
 * ARCHITECTURE.md §4.4 sketched it as `GET /groups/:id/chat`, but everything
 * under `/api/groups` is wrapped in `requireAuth`, and this endpoint
 * authenticates with a ticket instead of a bearer token — a handshake cannot
 * send an Authorization header. Mounting it inside that subtree meant the
 * bearer middleware rejected every socket with a 401 before the ticket was ever
 * read. A separate prefix keeps the two auth schemes from colliding.
 */
export const chatSocketRoutes = new Hono<AppEnv>()
  .get('/:id', async (c) => {
    if (c.req.header('Upgrade') !== 'websocket') {
      throw badRequest('This endpoint expects a WebSocket upgrade');
    }

    const groupId = c.req.param('id');
    const ticket = c.req.query('ticket');
    if (!ticket) throw unauthorized('A chat ticket is required');

    const claims = await verifyChatTicket(requireSecret(c.env), ticket);
    if (!claims) throw unauthorized('That chat ticket is invalid or expired');
    // A ticket for one room must not open another.
    if (claims.groupId !== groupId) throw forbidden('That ticket is for a different group');

    const client = db(c.env.DB);
    // Re-check membership at connect time: the ticket may have been issued
    // moments before the user was removed.
    await assertMember(client, groupId, claims.userId);

    const user = await client.query.users.findFirst({
      where: eq(users.id, claims.userId),
      columns: { handle: true, displayName: true },
    });
    if (!user) throw unauthorized();

    const room = c.env.GROUP_CHAT.getByName(groupId);

    // Identity is passed to the DO by the Worker, which has already verified it;
    // the DO is not reachable from outside.
    const url = new URL(c.req.url);
    url.searchParams.set('groupId', groupId);
    url.searchParams.set('userId', claims.userId);
    url.searchParams.set('handle', user.handle);
    url.searchParams.set('displayName', user.displayName);
    url.searchParams.delete('ticket');

    return room.fetch(new Request(url, c.req.raw));
  });

/** Group-scoped chat reads, which use the normal bearer token. */
export const chatRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /** Issues the short-lived ticket, after checking membership. */
  .post('/:id/chat-ticket', async (c) => {
    const groupId = c.req.param('id');
    const userId = currentUserId(c);
    await assertMember(db(c.env.DB), groupId, userId);

    const { ticket, expiresAt } = await signChatTicket(requireSecret(c.env), groupId, userId);
    return c.json({ ticket, expiresAt });
  })

  /** History, newest first, paged on `before` (§4.4). */
  .get('/:id/messages', zValidator('query', listMessagesQuerySchema), async (c) => {
    const groupId = c.req.param('id');
    const { before, limit } = c.req.valid('query');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    await assertMember(client, groupId, userId);

    const rows = await client
      .select({
        id: messages.id,
        groupId: messages.groupId,
        senderId: messages.senderId,
        body: messages.body,
        createdAt: messages.createdAt,
        senderHandle: users.handle,
        senderDisplayName: users.displayName,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.groupId, groupId),
          isNull(messages.deletedAt),
          ...(before ? [lt(messages.createdAt, before)] : []),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    /**
     * A blocked sender's messages are collapsed rather than removed (PRODUCT.md
     * §6.1): the row stays so the conversation still makes sense to everyone
     * else quoting it, but its body is withheld from the person who blocked
     * them, or whom they blocked. Paging is unaffected because nothing is
     * dropped.
     */
    const blocked = new Set(await blockedIdsFor(client, userId));

    return c.json({
      // Returned newest-first; the client reverses for display.
      messages: page.map((row) =>
        blocked.has(row.senderId) ? { ...row, body: '', blocked: true as const } : { ...row, blocked: false as const },
      ),
      nextBefore: hasMore ? (page.at(-1)?.createdAt ?? null) : null,
    });
  });
