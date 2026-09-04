import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { createSessionSchema, joinSessionSchema, nudgeTaskSchema } from '@buddy/shared';

import { db, type Db } from '../db/client.js';
import { sessionParticipants, sessionTasks, sessions, tasks, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { mutedIdsFor } from '../services/blocks.js';
import { joinedOnTime, sendBuddyNudge } from '../services/pressure.js';
import { enqueuePush } from '../services/push.js';
import { attachTask, endSession, leaveSession, liveGroupSession } from '../services/sessions.js';
import { assertMember } from './groups.js';

/**
 * Group sessions (PRODUCT.md §3.1, slice 1): one clock for the room.
 *
 * A host opens one — now, or for a time the group agreed — and members join
 * it, with a task or without. While it runs, everyone present is out of the
 * chat (the room reads `session_participants` per message); when it ends,
 * every participant's minutes are counted and the streak day recorded
 * (services/sessions.ts). Presence is a heartbeat: a client that stops
 * beating is simply not present, and nothing else has to notice.
 */

/** What a client sees of one session. */
async function describe(client: Db, sessionId: string) {
  const session = await client.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return null;
  const participants = await client
    .select({
      userId: sessionParticipants.userId,
      handle: users.handle,
      displayName: users.displayName,
      avatarKey: users.avatarKey,
      state: sessionParticipants.state,
      joinedAt: sessionParticipants.joinedAt,
      lastSeenAt: sessionParticipants.lastSeenAt,
      presentMinutes: sessionParticipants.presentMinutes,
    })
    .from(sessionParticipants)
    .innerJoin(users, eq(users.id, sessionParticipants.userId))
    .where(eq(sessionParticipants.sessionId, sessionId))
    .orderBy(sessionParticipants.createdAt);
  const brought = await client
    .select({ taskId: sessionTasks.taskId, minutes: sessionTasks.minutes, userId: tasks.userId, title: tasks.title })
    .from(sessionTasks)
    .innerJoin(tasks, eq(tasks.id, sessionTasks.taskId))
    .where(eq(sessionTasks.sessionId, sessionId));
  return { session, participants, tasks: brought, serverNow: nowIso() };
}

/** A running task of the caller's, in this group, that may be brought along. */
async function ownTask(client: Db, taskId: string, userId: string, groupId: string) {
  const task = await client.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw notFound('No such task');
  if (task.userId !== userId) throw forbidden('That task is not yours');
  if (task.groupId !== groupId) throw badRequest('That task belongs to another group');
  if (task.estimatedMinutes === null) throw badRequest('Say how long that task will take first');
  if (task.status === 'approved' || task.status === 'done') throw conflict('That task is already finished');
  return task;
}

/** Brings a task: starts its clock inside the session. */
async function bringTask(client: Db, sessionId: string, task: { id: string; startedAt: string | null }, at: string) {
  await client.update(tasks).set({ startedAt: task.startedAt ?? at, status: 'planned' }).where(eq(tasks.id, task.id));
  await attachTask(client, sessionId, task.id);
}

export const sessionGroupRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /**
   * Opens a session for the group. Without `scheduledFor` it is live now and
   * the host is present; with it, it waits for the host to start it.
   */
  .post('/:id/sessions', zValidator('json', createSessionSchema), async (c) => {
    const groupId = c.req.param('id');
    const { plannedMinutes, breakMinutes, scheduledFor, taskId } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    await assertMember(client, groupId, userId);
    if (scheduledFor && Date.parse(scheduledFor) < Date.now() - 60_000) {
      throw badRequest('That time has already passed');
    }
    if (await liveGroupSession(client, groupId)) {
      throw conflict('This group already has a session running — join it');
    }

    const task = taskId ? await ownTask(client, taskId, userId, groupId) : null;
    const now = nowIso();
    const id = newId();
    const live = !scheduledFor;

    await client.batch([
      client.insert(sessions).values({
        id,
        groupId,
        hostId: userId,
        kind: 'group',
        state: live ? 'live' : 'scheduled',
        plannedMinutes,
        breakMinutes,
        scheduledFor: scheduledFor ?? null,
        startedAt: live ? now : null,
      }),
      client.insert(sessionParticipants).values({
        sessionId: id,
        userId,
        state: live ? 'present' : 'committed',
        joinedAt: live ? now : null,
        lastSeenAt: live ? now : null,
        // Whoever opens a live session is there for its start.
        onTime: live ? 1 : null,
      }),
    ]);
    if (task && live) await bringTask(client, id, task, now);

    // Everyone else in the room hears about it, unless they muted the room.
    const muted = await mutedIdsFor(client, groupId);
    const others = (
      await client.query.groupMembers.findMany({
        where: (m, { eq: equals }) => equals(m.groupId, groupId),
        columns: { userId: true },
      })
    )
      .map((m) => m.userId)
      .filter((memberId) => memberId !== userId && !muted.has(memberId));
    const host = await client.query.users.findFirst({ where: eq(users.id, userId), columns: { displayName: true } });
    await enqueuePush(c.env, {
      userIds: others,
      title: live
        ? `${host?.displayName ?? 'Someone'} started a ${plannedMinutes}-minute session`
        : `${host?.displayName ?? 'Someone'} scheduled a session`,
      body: live ? 'Join it and the clock is shared.' : 'Commit, and it starts when the host does.',
      data: { type: 'session_started', sessionId: id, groupId, url: `/groups/${groupId}` },
    });

    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(groupId).noteFocusChange(userId));

    return c.json(await describe(client, id), 201);
  })

  /** The group's live session, else its next scheduled one, else null. */
  .get('/:id/sessions/current', async (c) => {
    const groupId = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    await assertMember(client, groupId, userId);

    const live = await liveGroupSession(client, groupId);
    const next =
      live ??
      (await client.query.sessions.findFirst({
        where: and(eq(sessions.groupId, groupId), eq(sessions.kind, 'group'), eq(sessions.state, 'scheduled')),
        orderBy: [sessions.scheduledFor],
      }));
    if (!next) return c.json({ session: null, participants: [], tasks: [], serverNow: nowIso() });
    return c.json(await describe(client, next.id));
  })

  /** Recent sessions, newest first, for the group's own record. */
  .get('/:id/sessions', async (c) => {
    const groupId = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    await assertMember(client, groupId, userId);
    const rows = await client.query.sessions.findMany({
      where: and(eq(sessions.groupId, groupId), inArray(sessions.state, ['ended', 'live', 'scheduled'])),
      orderBy: [desc(sessions.createdAt)],
      limit: 20,
    });
    return c.json({ sessions: rows });
  });

export const sessionRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/:id', async (c) => {
    const client = db(c.env.DB);
    const described = await describe(client, c.req.param('id'));
    if (!described) throw notFound('No such session');
    await assertMember(client, described.session.groupId, currentUserId(c));
    return c.json(described);
  })

  /** Joining: present if it is live, committed if it is scheduled. A task may come along. */
  .post('/:id/join', zValidator('json', joinSessionSchema.optional()), async (c) => {
    const id = c.req.param('id');
    const { taskId } = c.req.valid('json') ?? {};
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const session = await client.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!session) throw notFound('No such session');
    await assertMember(client, session.groupId, userId);
    if (session.state === 'ended' || session.state === 'cancelled') throw conflict('That session is over');

    const task = taskId ? await ownTask(client, taskId, userId, session.groupId) : null;
    const now = nowIso();
    const live = session.state === 'live';

    // On time means present within five minutes of the start (PRODUCT.md §3.3).
    const onTime = live ? joinedOnTime(session.startedAt, now) : null;
    await client
      .insert(sessionParticipants)
      .values({
        sessionId: id,
        userId,
        state: live ? 'present' : 'committed',
        joinedAt: live ? now : null,
        lastSeenAt: live ? now : null,
        onTime,
      })
      .onConflictDoUpdate({
        target: [sessionParticipants.sessionId, sessionParticipants.userId],
        set: {
          state: live ? 'present' : 'committed',
          joinedAt: live ? now : null,
          lastSeenAt: live ? now : null,
          leftAt: null,
          // A first join decides it; a rejoin after leaving does not rewrite it.
          onTime: sql`COALESCE(${sessionParticipants.onTime}, ${onTime})`,
        },
      });
    if (task && live) await bringTask(client, id, task, now);

    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(session.groupId).noteFocusChange(userId));
    return c.json(await describe(client, id));
  })

  /** Presence. Called every minute or so by a client that is on the session screen. */
  .post('/:id/heartbeat', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    await client
      .update(sessionParticipants)
      .set({ lastSeenAt: nowIso() })
      .where(
        and(
          eq(sessionParticipants.sessionId, id),
          eq(sessionParticipants.userId, userId),
          eq(sessionParticipants.state, 'present'),
        ),
      );
    return c.json({ ok: true as const, serverNow: nowIso() });
  })

  /** Leaving early. The minutes so far count; the streak day counts. */
  .post('/:id/leave', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    const session = await client.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!session) throw notFound('No such session');
    await assertMember(client, session.groupId, userId);

    if (session.state === 'scheduled') {
      await client
        .delete(sessionParticipants)
        .where(and(eq(sessionParticipants.sessionId, id), eq(sessionParticipants.userId, userId)));
    } else if (session.state === 'live') {
      await leaveSession(client, session, userId, nowIso());
    }
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(session.groupId).noteFocusChange(userId));
    return c.json(await describe(client, id));
  })

  /** The host starts a scheduled session. Committed members become present. */
  .post('/:id/start', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    const session = await client.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!session) throw notFound('No such session');
    if (session.hostId !== userId) throw forbidden('Only the host can start it');
    if (session.state !== 'scheduled') throw conflict('That session is not waiting to start');
    if (await liveGroupSession(client, session.groupId)) throw conflict('Another session is already running');

    /**
     * Only the host is present at the start. Everyone who committed stays
     * `committed` until they join — that is what lets the pressure job tell
     * late from absent (PRODUCT.md §3.3), and it is the truth: a commitment is
     * not attendance.
     */
    const now = nowIso();
    await client.batch([
      client.update(sessions).set({ state: 'live', startedAt: now }).where(eq(sessions.id, id)),
      client
        .update(sessionParticipants)
        .set({ state: 'present', joinedAt: now, lastSeenAt: now, onTime: 1 })
        .where(and(eq(sessionParticipants.sessionId, id), eq(sessionParticipants.userId, userId))),
    ]);

    const committed = await client.query.sessionParticipants.findMany({
      where: eq(sessionParticipants.sessionId, id),
      columns: { userId: true },
    });
    await enqueuePush(c.env, {
      userIds: committed.map((p) => p.userId).filter((p) => p !== userId),
      title: 'Your session started',
      body: 'Tap to join the clock.',
      data: { type: 'session_started', sessionId: id, groupId: session.groupId, url: `/groups/${session.groupId}` },
    });
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(session.groupId).noteFocusChange(userId));
    return c.json(await describe(client, id));
  })

  /**
   * A present member nudges somebody who committed and has not arrived
   * (PRODUCT.md §3.3): the same four lines, one per sender per target per
   * session, inside the recipient's daily budget.
   */
  .post('/:id/nudge/:userId', zValidator('json', nudgeTaskSchema), async (c) => {
    const id = c.req.param('id');
    const toUserId = c.req.param('userId');
    const { template } = c.req.valid('json');
    const fromUserId = currentUserId(c);
    const client = db(c.env.DB);

    const session = await client.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!session) throw notFound('No such session');
    if (session.state !== 'live') throw conflict('That session is not running');
    if (toUserId === fromUserId) throw badRequest('You cannot nudge yourself');

    const [me, them] = await Promise.all([
      client.query.sessionParticipants.findFirst({
        where: and(eq(sessionParticipants.sessionId, id), eq(sessionParticipants.userId, fromUserId)),
      }),
      client.query.sessionParticipants.findFirst({
        where: and(eq(sessionParticipants.sessionId, id), eq(sessionParticipants.userId, toUserId)),
      }),
    ]);
    if (!me || me.state !== 'present') throw forbidden('Join the session to nudge from it');
    if (!them || !['committed', 'late'].includes(them.state)) throw conflict('They are not waiting to be nudged');

    const sender = await client.query.users.findFirst({ where: eq(users.id, fromUserId), columns: { displayName: true } });
    const result = await sendBuddyNudge(client, c.env, {
      fromUserId,
      fromName: sender?.displayName ?? 'Someone',
      toUserId,
      template,
      sessionId: id,
      groupId: session.groupId,
      title: `${session.plannedMinutes}-minute session, running now`,
    });
    if (!result.ok) throw conflict(result.reason);
    return c.json({ id: result.id, template }, 201);
  })

  /** The host ends it. Everyone present is settled. */
  .post('/:id/end', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    const session = await client.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!session) throw notFound('No such session');
    if (session.hostId !== userId) throw forbidden('Only the host can end it');
    if (session.state !== 'live') throw conflict('That session is not running');

    await endSession(client, id, nowIso());
    const participants = await client.query.sessionParticipants.findMany({
      where: eq(sessionParticipants.sessionId, id),
      columns: { userId: true },
    });
    for (const p of participants) {
      c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(session.groupId).noteFocusChange(p.userId));
    }
    return c.json(await describe(client, id));
  })

  /** The host calls off a scheduled one. */
  .post('/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    const session = await client.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!session) throw notFound('No such session');
    if (session.hostId !== userId) throw forbidden('Only the host can cancel it');
    if (session.state !== 'scheduled') throw conflict('Only a scheduled session can be cancelled');
    await client.update(sessions).set({ state: 'cancelled' }).where(eq(sessions.id, id));
    return c.json(await describe(client, id));
  });
