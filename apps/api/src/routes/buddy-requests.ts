import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import {
  BUDDY_REQUEST_COOLDOWN_MS,
  BUDDY_REQUEST_TTL_MS,
  createBuddyRequestSchema,
} from '@buddy/shared';

import { db, type Db } from '../db/client.js';
import { buddyRequests, groupMembers, groups, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, forbidden, gone, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { clientIp, enforceRateLimit } from '../lib/rate-limit.js';
import { isoIn, nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { enqueuePush } from '../services/push.js';

/**
 * Buddy requests with a 5-minute window (§2.2, §4.5).
 *
 * **Lazy expiry.** Every endpoint that touches pending requests first sweeps
 * `status='pending' AND expires_at < now` to 'expired'. No cron is needed, and
 * because accept re-checks `expires_at` inside its own UPDATE, there is no race
 * between the sweep and an accept landing in the same millisecond.
 *
 * **The clock is the server's.** `expiresAt` is set server-side and returned to
 * the app, which drives its countdown from that value plus a measured offset —
 * never from the phone's own clock (§5.1).
 */

/** Marks lapsed requests expired. Cheap: the index is (status, expires_at). */
async function sweepExpired(client: Db): Promise<void> {
  await client
    .update(buddyRequests)
    .set({ status: 'expired', respondedAt: nowIso() })
    .where(and(eq(buddyRequests.status, 'pending'), lt(buddyRequests.expiresAt, nowIso())));
}

function describeRequest(row: typeof buddyRequests.$inferSelect, other: {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  goalText: string | null;
  goalKey: string | null;
}) {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt,
    /** The app's countdown is driven by this, not by its own clock. */
    expiresAt: row.expiresAt,
    /** Server time at the moment of the response, so the app can measure offset. */
    serverNow: nowIso(),
    user: other,
  };
}

const publicUserColumns = {
  id: true,
  handle: true,
  displayName: true,
  avatarKey: true,
  goalKey: true,
  goalText: true,
} as const;

export const buddyRequestRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /** Sends a request. One pending at a time, enforced by a partial unique index. */
  .post('/', zValidator('json', createBuddyRequestSchema), async (c) => {
    const { toUserId, message } = c.req.valid('json');
    const fromUserId = currentUserId(c);
    if (toUserId === fromUserId) throw badRequest('You cannot buddy up with yourself');

    await enforceRateLimit(c.env.CACHE, 'buddyRequest', `${fromUserId}:${clientIp(c.req.raw)}`);

    const client = db(c.env.DB);
    await sweepExpired(client);

    const target = await client.query.users.findFirst({
      where: eq(users.id, toUserId),
      columns: { id: true, isOpenBuddy: true, deletedAt: true, displayName: true },
    });
    if (!target || target.deletedAt !== null) throw notFound('That person is no longer here');
    if (!target.isOpenBuddy) throw forbidden('That person is not taking buddy requests');

    const existing = await client.query.buddyRequests.findFirst({
      where: and(eq(buddyRequests.fromUserId, fromUserId), eq(buddyRequests.status, 'pending')),
    });
    if (existing) {
      throw conflict('You already have a request waiting', { expiresAt: existing.expiresAt });
    }

    /**
     * Re-request cooldown (§2.2): after a decline or a timeout, the same person
     * cannot be asked again for an hour. Without this, "request again" becomes a
     * way to spam someone with push notifications.
     */
    const recent = await client.query.buddyRequests.findFirst({
      where: and(
        eq(buddyRequests.fromUserId, fromUserId),
        eq(buddyRequests.toUserId, toUserId),
        or(eq(buddyRequests.status, 'declined'), eq(buddyRequests.status, 'expired')),
        gt(
          buddyRequests.respondedAt,
          new Date(Date.now() - BUDDY_REQUEST_COOLDOWN_MS).toISOString(),
        ),
      ),
      orderBy: [desc(buddyRequests.respondedAt)],
    });
    if (recent) {
      const retryAt = new Date(
        Date.parse(recent.respondedAt!) + BUDDY_REQUEST_COOLDOWN_MS,
      ).toISOString();
      throw conflict('You asked them recently — try someone else for now', { retryAt });
    }

    // Already in a group together? Then there is nothing to request.
    const shared = await client
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, fromUserId));
    if (shared.length > 0) {
      const mate = await client.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.userId, toUserId),
          sql`${groupMembers.groupId} IN (SELECT group_id FROM group_members WHERE user_id = ${fromUserId})`,
        ),
      });
      if (mate) throw conflict('You are already in a group with them');
    }

    const id = newId();
    const expiresAt = isoIn(BUDDY_REQUEST_TTL_MS);

    await client.insert(buddyRequests).values({
      id,
      fromUserId,
      toUserId,
      message: message ?? null,
      status: 'pending',
      expiresAt,
    });

    const sender = await client.query.users.findFirst({
      where: eq(users.id, fromUserId),
      columns: { displayName: true },
    });

    await enqueuePush(c.env, {
      userIds: [toUserId],
      title: `${sender?.displayName ?? 'Someone'} wants you as a buddy`,
      body: 'Respond within 5 minutes',
      data: { type: 'buddy_request', requestId: id, url: '/(tabs)/buddies' },
    });

    return c.json({ id, expiresAt, serverNow: nowIso(), status: 'pending' as const }, 201);
  })

  /** The requester's pending request — polled every 5s to drive the countdown. */
  .get('/current', async (c) => {
    const client = db(c.env.DB);
    await sweepExpired(client);

    const fromUserId = currentUserId(c);
    const row = await client.query.buddyRequests.findFirst({
      where: and(eq(buddyRequests.fromUserId, fromUserId), eq(buddyRequests.status, 'pending')),
    });

    if (!row) {
      /**
       * No pending request. The poll also has to deliver the *outcome*, or the
       * requester would never learn they were accepted: report the most recent
       * resolution from the last few minutes so the app can react once and stop.
       */
      const recent = await client.query.buddyRequests.findFirst({
        where: and(
          eq(buddyRequests.fromUserId, fromUserId),
          gt(buddyRequests.respondedAt, new Date(Date.now() - 10 * 60 * 1000).toISOString()),
        ),
        orderBy: [desc(buddyRequests.respondedAt)],
      });

      if (!recent) return c.json({ request: null, outcome: null });

      const other = await client.query.users.findFirst({
        where: eq(users.id, recent.toUserId),
        columns: publicUserColumns,
      });

      // On acceptance, hand back the group so the app can navigate straight in.
      const group =
        recent.status === 'accepted'
          ? await client.query.groups.findFirst({
              where: sql`${groups.id} IN (
                SELECT group_id FROM group_members WHERE user_id = ${recent.fromUserId}
                INTERSECT
                SELECT group_id FROM group_members WHERE user_id = ${recent.toUserId}
              )`,
              orderBy: [desc(groups.createdAt)],
            })
          : null;

      return c.json({
        request: null,
        outcome: {
          status: recent.status,
          respondedAt: recent.respondedAt,
          user: other ?? null,
          group: group ? { id: group.id, name: group.name } : null,
        },
      });
    }

    const other = await client.query.users.findFirst({
      where: eq(users.id, row.toUserId),
      columns: publicUserColumns,
    });

    return c.json({ request: describeRequest(row, other!), outcome: null });
  })

  /** Requests addressed to me, for the in-app banner. */
  .get('/incoming', async (c) => {
    const client = db(c.env.DB);
    await sweepExpired(client);

    const toUserId = currentUserId(c);
    const rows = await client.query.buddyRequests.findMany({
      where: and(eq(buddyRequests.toUserId, toUserId), eq(buddyRequests.status, 'pending')),
      orderBy: [desc(buddyRequests.createdAt)],
    });

    const described = await Promise.all(
      rows.map(async (row) => {
        const other = await client.query.users.findFirst({
          where: eq(users.id, row.fromUserId),
          columns: publicUserColumns,
        });
        return describeRequest(row, other!);
      }),
    );

    return c.json({ requests: described });
  })

  /**
   * Accepts, creating the 2-person group. The status transition and the
   * expiry check happen in one UPDATE, so an accept that arrives at the same
   * instant as the sweep either wins cleanly or loses cleanly — never both.
   */
  .post('/:id/accept', async (c) => {
    const id = c.req.param('id');
    const toUserId = currentUserId(c);
    const client = db(c.env.DB);

    const row = await client.query.buddyRequests.findFirst({
      where: eq(buddyRequests.id, id),
    });
    if (!row) throw notFound('That request no longer exists');
    if (row.toUserId !== toUserId) throw forbidden('That request is not yours');
    if (row.status === 'accepted') throw conflict('That request was already accepted');
    if (row.status !== 'pending') throw gone('That request is no longer waiting');

    const claimed = await client
      .update(buddyRequests)
      .set({ status: 'accepted', respondedAt: nowIso() })
      .where(
        and(
          eq(buddyRequests.id, id),
          eq(buddyRequests.status, 'pending'),
          gt(buddyRequests.expiresAt, nowIso()),
        ),
      )
      .returning({ id: buddyRequests.id });

    if (claimed.length === 0) throw gone('That request expired');

    const [requester, accepter] = await Promise.all([
      client.query.users.findFirst({
        where: eq(users.id, row.fromUserId),
        columns: { displayName: true },
      }),
      client.query.users.findFirst({
        where: eq(users.id, toUserId),
        columns: { displayName: true },
      }),
    ]);

    const groupId = newId();
    const name = `${requester?.displayName ?? 'Buddy'} & ${accepter?.displayName ?? 'Buddy'}`;

    // One batch so the group and both memberships appear together (§4.5).
    await client.batch([
      client.insert(groups).values({
        id: groupId,
        name,
        createdBy: row.fromUserId,
        kind: 'matched',
      }),
      client.insert(groupMembers).values({
        groupId,
        userId: row.fromUserId,
        role: 'owner',
      }),
      client.insert(groupMembers).values({ groupId, userId: toUserId, role: 'member' }),
    ]);

    await enqueuePush(c.env, {
      userIds: [row.fromUserId],
      title: `${accepter?.displayName ?? 'Your buddy'} accepted`,
      body: `You're now buddies — say hello.`,
      data: { type: 'buddy_accepted', groupId, url: `/groups/${groupId}` },
    });

    return c.json({ group: { id: groupId, name, kind: 'matched' as const } }, 201);
  })

  .post('/:id/decline', async (c) => {
    const id = c.req.param('id');
    const toUserId = currentUserId(c);
    const client = db(c.env.DB);

    const row = await client.query.buddyRequests.findFirst({
      where: eq(buddyRequests.id, id),
    });
    if (!row) throw notFound('That request no longer exists');
    if (row.toUserId !== toUserId) throw forbidden('That request is not yours');
    if (row.status !== 'pending') throw gone('That request is no longer waiting');

    await client
      .update(buddyRequests)
      .set({ status: 'declined', respondedAt: nowIso() })
      .where(and(eq(buddyRequests.id, id), eq(buddyRequests.status, 'pending')));

    // The requester is told only that there was no match, never that it was a
    // deliberate decline — the app copy is "No answer from X" either way (§2.2).
    await enqueuePush(c.env, {
      userIds: [row.fromUserId],
      title: 'No match this time',
      body: 'Try another buddy from the directory.',
      data: { type: 'buddy_declined', url: '/(tabs)/buddies' },
    });

    return c.json({ ok: true as const });
  })

  /** The requester giving up before the window closes. */
  .post('/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const fromUserId = currentUserId(c);
    const client = db(c.env.DB);

    const row = await client.query.buddyRequests.findFirst({
      where: eq(buddyRequests.id, id),
    });
    if (!row) throw notFound('That request no longer exists');
    if (row.fromUserId !== fromUserId) throw forbidden('That request is not yours');
    if (row.status !== 'pending') throw gone('That request is no longer waiting');

    await client
      .update(buddyRequests)
      .set({ status: 'expired', respondedAt: nowIso() })
      .where(and(eq(buddyRequests.id, id), eq(buddyRequests.status, 'pending')));

    return c.json({ ok: true as const });
  });

export { sweepExpired };
