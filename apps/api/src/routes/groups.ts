import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { GROUP_INVITE_TTL_MS, createGroupSchema, inviteToGroupSchema } from '@buddy/shared';

import { db, type Db } from '../db/client.js';
import { groupInvites, groupMembers, groups, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, forbidden, gone, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { enqueuePush } from '../services/push.js';

/**
 * Groups and invitations (§2.3).
 *
 * Group invites are for people you already know, so unlike buddy requests they
 * last 7 days rather than 5 minutes. They are swept lazily on the same principle
 * as buddy requests: no cron, expiry checked wherever it matters.
 */

async function sweepExpiredInvites(client: Db): Promise<void> {
  await client
    .update(groupInvites)
    .set({ status: 'expired', respondedAt: nowIso() })
    .where(and(eq(groupInvites.status, 'pending'), lt(groupInvites.expiresAt, nowIso())));
}

/** Throws unless the caller is a member. Every group read goes through this. */
export async function assertMember(
  client: Db,
  groupId: string,
  userId: string,
): Promise<typeof groupMembers.$inferSelect> {
  const membership = await client.query.groupMembers.findFirst({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
  });
  if (!membership) throw forbidden('You are not in that group');
  return membership;
}

export const groupRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const rows = await client
      .select({
        id: groups.id,
        name: groups.name,
        emoji: groups.emoji,
        kind: groups.kind,
        createdAt: groups.createdAt,
        role: groupMembers.role,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, userId))
      .orderBy(desc(groups.createdAt));

    // One query for all member counts rather than one per group.
    const counts = await client
      .select({ groupId: groupMembers.groupId, count: sql<number>`count(*)` })
      .from(groupMembers)
      .where(
        sql`${groupMembers.groupId} IN (SELECT group_id FROM group_members WHERE user_id = ${userId})`,
      )
      .groupBy(groupMembers.groupId);

    const countByGroup = new Map(counts.map((row) => [row.groupId, Number(row.count)]));

    return c.json({
      groups: rows.map((row) => ({ ...row, memberCount: countByGroup.get(row.id) ?? 1 })),
    });
  })

  .post('/', zValidator('json', createGroupSchema), async (c) => {
    const { name, emoji } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    const groupId = newId();

    await client.batch([
      client.insert(groups).values({
        id: groupId,
        name,
        emoji: emoji ?? null,
        createdBy: userId,
        kind: 'friends',
      }),
      client.insert(groupMembers).values({ groupId, userId, role: 'owner' }),
    ]);

    return c.json({ group: { id: groupId, name, emoji: emoji ?? null, kind: 'friends' as const } }, 201);
  })

  .get('/:id', async (c) => {
    const groupId = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    await assertMember(client, groupId, userId);

    const group = await client.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) throw notFound('No such group');

    const members = await client
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
        goalText: users.goalText,
        goalKey: users.goalKey,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
        lastSeenAt: users.lastSeenAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), isNull(users.deletedAt)))
      .orderBy(groupMembers.joinedAt);

    return c.json({
      group: {
        id: group.id,
        name: group.name,
        emoji: group.emoji,
        kind: group.kind,
        createdAt: group.createdAt,
      },
      members,
    });
  })

  /**
   * Invites by @handle. The response does not distinguish "no such handle" from
   * "already a member" beyond what the inviter legitimately needs to act on.
   */
  .post('/:id/invites', zValidator('json', inviteToGroupSchema), async (c) => {
    const groupId = c.req.param('id');
    const { handle } = c.req.valid('json');
    const fromUserId = currentUserId(c);
    const client = db(c.env.DB);

    await assertMember(client, groupId, fromUserId);
    await sweepExpiredInvites(client);

    const target = await client.query.users.findFirst({
      where: eq(users.handle, handle),
      columns: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) throw notFound(`No one is using @${handle}`);
    if (target.id === fromUserId) throw badRequest('You are already in this group');

    const already = await client.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, target.id)),
    });
    if (already) throw conflict(`@${handle} is already in this group`);

    const pending = await client.query.groupInvites.findFirst({
      where: and(
        eq(groupInvites.groupId, groupId),
        eq(groupInvites.toUserId, target.id),
        eq(groupInvites.status, 'pending'),
      ),
    });
    if (pending) throw conflict(`@${handle} already has an invite waiting`);

    const id = newId();
    const group = await client.query.groups.findFirst({ where: eq(groups.id, groupId) });
    const inviter = await client.query.users.findFirst({
      where: eq(users.id, fromUserId),
      columns: { displayName: true },
    });

    await client.insert(groupInvites).values({
      id,
      groupId,
      fromUserId,
      toUserId: target.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + GROUP_INVITE_TTL_MS).toISOString(),
    });

    await enqueuePush(c.env, {
      userIds: [target.id],
      title: `${inviter?.displayName ?? 'Someone'} invited you to ${group?.name ?? 'a group'}`,
      body: 'Tap to accept',
      data: { type: 'group_invite', inviteId: id, url: '/(tabs)/groups' },
    });

    return c.json({ id, handle, status: 'pending' as const }, 201);
  })

  /** Leaving. The last member out deletes the group rather than orphaning it. */
  .post('/:id/leave', async (c) => {
    const groupId = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    await assertMember(client, groupId, userId);

    await client
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

    const remaining = await client
      .select({ count: sql<number>`count(*)` })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    if (Number(remaining[0]?.count ?? 0) === 0) {
      // Cascades to invites, tasks and messages via the schema's foreign keys.
      await client.delete(groups).where(eq(groups.id, groupId));
      return c.json({ ok: true as const, groupDeleted: true as const });
    }

    return c.json({ ok: true as const, groupDeleted: false as const });
  });

export const inviteRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    await sweepExpiredInvites(client);

    const rows = await client
      .select({
        id: groupInvites.id,
        status: groupInvites.status,
        expiresAt: groupInvites.expiresAt,
        createdAt: groupInvites.createdAt,
        groupId: groups.id,
        groupName: groups.name,
        groupEmoji: groups.emoji,
        fromHandle: users.handle,
        fromDisplayName: users.displayName,
      })
      .from(groupInvites)
      .innerJoin(groups, eq(groups.id, groupInvites.groupId))
      .innerJoin(users, eq(users.id, groupInvites.fromUserId))
      .where(and(eq(groupInvites.toUserId, userId), eq(groupInvites.status, 'pending')))
      .orderBy(desc(groupInvites.createdAt));

    return c.json({ invites: rows });
  })

  .post('/:id/accept', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const invite = await client.query.groupInvites.findFirst({
      where: eq(groupInvites.id, id),
    });
    if (!invite) throw notFound('That invite no longer exists');
    if (invite.toUserId !== userId) throw forbidden('That invite is not yours');
    if (invite.status !== 'pending') throw gone('That invite is no longer open');
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      await client
        .update(groupInvites)
        .set({ status: 'expired', respondedAt: nowIso() })
        .where(eq(groupInvites.id, id));
      throw gone('That invite expired');
    }

    await client.batch([
      client
        .update(groupInvites)
        .set({ status: 'accepted', respondedAt: nowIso() })
        .where(and(eq(groupInvites.id, id), eq(groupInvites.status, 'pending'))),
      client
        .insert(groupMembers)
        .values({ groupId: invite.groupId, userId, role: 'member' })
        // Re-accepting must not fail on the composite primary key.
        .onConflictDoNothing(),
    ]);

    const group = await client.query.groups.findFirst({ where: eq(groups.id, invite.groupId) });

    await enqueuePush(c.env, {
      userIds: [invite.fromUserId],
      title: 'Invite accepted',
      body: `Someone joined ${group?.name ?? 'your group'}.`,
      data: { type: 'invite_accepted', groupId: invite.groupId, url: `/groups/${invite.groupId}` },
    });

    return c.json({ group: group ? { id: group.id, name: group.name } : null });
  })

  .post('/:id/decline', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const invite = await client.query.groupInvites.findFirst({
      where: eq(groupInvites.id, id),
    });
    if (!invite) throw notFound('That invite no longer exists');
    if (invite.toUserId !== userId) throw forbidden('That invite is not yours');
    if (invite.status !== 'pending') throw gone('That invite is no longer open');

    await client
      .update(groupInvites)
      .set({ status: 'declined', respondedAt: nowIso() })
      .where(and(eq(groupInvites.id, id), eq(groupInvites.status, 'pending')));

    return c.json({ ok: true as const });
  });
