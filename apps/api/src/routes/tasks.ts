import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  createTaskSchema,
  inQuietHours,
  localDateSchema,
  markTaskDoneSchema,
  nudgeTaskSchema,
  requestCheckinSchema,
  reviewTaskSchema,
  ulidSchema,
  updateTaskSchema,
} from '@buddy/shared';

import { db, type Db } from '../db/client.js';
import { groupMembers, groups, sessions, taskReviews, tasks, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { localDate, localDateOrUtc, localHour, nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { syncBadges } from '../services/badges.js';
import { mutedIdsFor } from '../services/blocks.js';
import { awardApproval, countReview } from '../services/credits.js';
import { enqueuePush } from '../services/push.js';
import { reviewRightsFor } from '../services/review-rights.js';
import { latestStart, nudgesForTask, requestCheckin, sendBuddyNudge } from '../services/pressure.js';
import {
  attachTask,
  endSession,
  liveGroupSession,
  presentInLiveSession,
  settleTaskClock,
  startSoloSession,
} from '../services/sessions.js';
import { assertMember } from './groups.js';

/**
 * Daily tasks and the review loop (§2.4, §4.8).
 *
 * ```
 * planned ──done──▶ done ──approve(rating)──▶ approved
 *    │  ▲             │
 *    │  │             └──request_proof──▶ proof_requested ──proof──▶ done
 *    └──┼── local midnight passes (hourly cron) ──▶ missed
 *       └── start, or a move to a day that has not passed ───┘
 * ```
 *
 * **Missed is not terminal.** A day ending is not a verdict on the task, so
 * picking it back up — starting it, or moving it to tomorrow — returns it to
 * `planned`. Both paths also move its due date forward, because the rollover
 * runs hourly and would otherwise re-miss a task somebody is working on.
 *
 * **Reviewer rule (§2.4 decision):** any other member of the group may review,
 * and the first review is final. That is enforced by a guarded UPDATE that
 * claims the task — not by reading the status and then writing, which two
 * reviewers tapping at the same moment would both pass.
 *
 * **A 0 rating still approves.** It closes the task and counts toward the
 * streak; it just earns nothing. There is no rejected state in the machine, and
 * inventing one would leave tasks stuck forever.
 */

const listQuerySchema = z.object({
  groupId: ulidSchema.optional(),
  date: localDateSchema.optional(),
  /**
   * - `mine` (default): the caller's own tasks.
   * - `review`: the cross-group queue of buddies' tasks awaiting a review. The
   *   Today tab needs this in one request; per-group would be N requests.
   * - `all`: every member's tasks, for a group's board. Requires `groupId`,
   *   since "all tasks everywhere" is not a view anything needs and would grow
   *   without bound.
   */
  scope: z.enum(['mine', 'review', 'all']).default('mine'),
});

/** The owner's local calendar day, used to reject planning into the past. */
async function ownerToday(client: Db, userId: string): Promise<string> {
  const user = await client.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { timezone: true },
  });
  return localDate(user?.timezone ?? 'UTC');
}

/**
 * What a listed task carries. `estimatedMinutes` and `startedAt` are part of it
 * because a list is where the clock is read: without them a client cannot tell a
 * running task from a planned one, and cannot know whether starting is even
 * offered. Leaving them out is what once made every task in the group board look
 * as though it were already running.
 */
const taskColumns = {
  id: tasks.id,
  userId: tasks.userId,
  groupId: tasks.groupId,
  title: tasks.title,
  notes: tasks.notes,
  dueDate: tasks.dueDate,
  estimatedMinutes: tasks.estimatedMinutes,
  startedAt: tasks.startedAt,
  sessionId: tasks.sessionId,
  actualMinutes: tasks.actualMinutes,
  startBy: tasks.startBy,
  status: tasks.status,
  proofText: tasks.proofText,
  proofImageKey: tasks.proofImageKey,
  doneAt: tasks.doneAt,
  createdAt: tasks.createdAt,
};

/**
 * A client-supplied proof key is not trusted, exactly as `posts.ts` does not
 * trust a post's image key. The prefix is namespaced by user id, so this is
 * what stops somebody attaching another person's upload — or an avatar — to
 * their own task and having the group review a picture they never took.
 */
function assertOwnProofKey(key: string | undefined, userId: string): void {
  if (key && !key.startsWith(`proofs/${userId}/`)) {
    throw badRequest('That upload key is not yours');
  }
}

export const taskRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', zValidator('query', listQuerySchema), async (c) => {
    const { groupId, date, scope } = c.req.valid('query');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const myGroupIds = (
      await client
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(eq(groupMembers.userId, userId))
    ).map((row) => row.groupId);

    if (myGroupIds.length === 0) return c.json({ tasks: [] });
    if (groupId && !myGroupIds.includes(groupId)) throw forbidden('You are not in that group');
    if (scope === 'all' && !groupId) {
      throw badRequest('A groupId is required to list every member\'s tasks');
    }

    const scopeConditions =
      scope === 'review'
        ? [
            // Someone else's task, in a group I'm in, waiting on a review.
            ne(tasks.userId, userId),
            eq(tasks.status, 'done'),
            /**
             * ...and one this caller is actually allowed to review. The three
             * branches mirror `reviewRightsFor`, in SQL because this is a list
             * rather than a single decision — offering a review that will be
             * refused is worse than not offering it.
             *
             * A group with no Buddy, or one whose Buddy has left, keeps the
             * original any-member rule, which is what makes this safe for every
             * group that predates the feature.
             */
            sql`(
              SELECT CASE
                WHEN g.buddy_user_id IS NULL
                  OR g.buddy_user_id NOT IN (
                    SELECT user_id FROM group_members WHERE group_id = g.id
                  )
                  THEN 1
                WHEN ${tasks.userId} = g.buddy_user_id THEN
                  CASE
                    WHEN g.buddy_verifier_id IS NULL
                      OR g.buddy_verifier_id = g.buddy_user_id
                      OR g.buddy_verifier_id NOT IN (
                        SELECT user_id FROM group_members WHERE group_id = g.id
                      )
                      THEN 1
                    ELSE g.buddy_verifier_id = ${userId}
                  END
                ELSE g.buddy_user_id = ${userId}
              END
              FROM groups g WHERE g.id = ${tasks.groupId}
            )`,
          ]
        : scope === 'all'
          ? // Everyone's tasks in the one group, already membership-checked above.
            []
          : [eq(tasks.userId, userId)];

    const rows = await client
      .select({
        ...taskColumns,
        ownerHandle: users.handle,
        ownerDisplayName: users.displayName,
        ownerTimezone: users.timezone,
        groupName: groups.name,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.userId))
      .innerJoin(groups, eq(groups.id, tasks.groupId))
      .where(
        and(
          inArray(tasks.groupId, groupId ? [groupId] : myGroupIds),
          ...(date ? [eq(tasks.dueDate, date)] : []),
          ...scopeConditions,
        ),
      )
      .orderBy(desc(tasks.dueDate), tasks.createdAt);

    /**
     * The latest start (PRODUCT.md §3.1, slice 2), derived per task from the
     * owner's own midnight and the estimate, so a groupmate can see "start by
     * 22:30" without the owner scheduling anything. `latestStartAt` is an
     * instant; `startBy` above is only the owner's earlier override.
     */
    return c.json({
      tasks: rows.map(({ ownerTimezone, ...row }) => ({
        ...row,
        latestStartAt: latestStart(row, ownerTimezone),
      })),
    });
  })

  .post('/', zValidator('json', createTaskSchema), async (c) => {
    const { groupId, title, notes, dueDate, estimatedMinutes } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    await assertMember(client, groupId, userId);

    // Planning into a day that has already ended would create a task that the
    // rollover immediately marks missed.
    if (dueDate < (await ownerToday(client, userId))) {
      throw badRequest("That day has already passed — plan for today or later");
    }

    const id = newId();
    await client.insert(tasks).values({
      id,
      userId,
      groupId,
      title,
      notes: notes ?? null,
      dueDate,
      estimatedMinutes: estimatedMinutes ?? null,
      status: 'planned',
    });

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row }, 201);
  })

  /** Edits are the owner's alone, and only while the task is still planned. */
  .patch('/:id', zValidator('json', updateTaskSchema), async (c) => {
    const id = c.req.param('id');
    const patch = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    /**
     * A missed task is editable too. It is the state where editing matters most
     * — "give it more time", "not today, tomorrow" — and refusing the edit left
     * the owner with a dead row and no way to revive it but to retype it.
     */
    if (task.status !== 'planned' && task.status !== 'missed') {
      throw conflict('That task is already under review — you can update the proof instead');
    }

    if (patch.dueDate && patch.dueDate < (await ownerToday(client, userId))) {
      throw badRequest("That day has already passed — plan for today or later");
    }

    /**
     * Moving a missed task to a day that has not passed makes it a plan again —
     * that is what "not today, tomorrow" means, and the date check above has
     * already refused anything earlier than today.
     *
     * Changing only the estimate does *not* revive it: the task would go back to
     * `planned` still sitting on a day that has passed, and the next rollover
     * would mark it missed again. Giving a missed task more time is preparation
     * for restarting it, not the restart itself.
     */
    const revived = task.status === 'missed' && patch.dueDate !== undefined;

    /**
     * The owner's own "start by" may only bring the derived latest start
     * forward. Later than the arithmetic allows is refused: the task could not
     * be finished that day, and a promise the clock cannot keep is not one.
     */
    if (patch.startBy) {
      const owner = await client.query.users.findFirst({ where: eq(users.id, userId), columns: { timezone: true } });
      const timezone = owner?.timezone ?? 'UTC';
      const next = {
        dueDate: patch.dueDate ?? task.dueDate,
        estimatedMinutes: patch.estimatedMinutes === undefined ? task.estimatedMinutes : (patch.estimatedMinutes ?? null),
      };
      const ceiling = latestStart({ ...next, startBy: null }, timezone);
      const own = latestStart({ ...next, startBy: patch.startBy }, timezone);
      if (ceiling && own && own === ceiling) {
        throw badRequest('That is later than the task can be started and still finish that day');
      }
    }

    await client
      .update(tasks)
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.notes !== undefined && { notes: patch.notes ?? null }),
        ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
        ...(patch.estimatedMinutes !== undefined && {
          estimatedMinutes: patch.estimatedMinutes ?? null,
        }),
        ...(patch.startBy !== undefined && { startBy: patch.startBy ?? null }),
        ...(revived && { status: 'planned' as const }),
      })
      .where(and(eq(tasks.id, id), inArray(tasks.status, ['planned', 'missed'])));

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row });
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    if (task.status === 'approved') throw conflict('An approved task cannot be deleted');

    await client.delete(tasks).where(eq(tasks.id, id));
    // Mirrors posts.ts: the row is the only reference to the object, so
    // dropping the row without the object leaks it permanently.
    if (task.proofImageKey) c.executionCtx.waitUntil(c.env.STORAGE.delete(task.proofImageKey));
    return c.json({ ok: true as const });
  })

  /**
   * The proof photo, for the people entitled to review it (§2.4).
   *
   * **Why this is not `/api/media/:key` like every other image.** That route is
   * deliberately unauthenticated, on the reasoning that avatars and Feed photos
   * are already visible to every signed-in user, so a bearer token would cost
   * the CDN cache and buy no privacy. A proof is the opposite: it is a photo of
   * somebody's desk, screen or handwriting, shown to one small group as
   * evidence — and `media.ts` says in so many words that proof images "are
   * group-private and will need a different, authenticated path". This is it.
   *
   * Membership is re-checked on every read rather than trusted from the task
   * row: leaving a group has to stop the images resolving, and an unguessable
   * key is not an access control.
   *
   * `private, no-store` for the same reason. `/api/media` caches for a year
   * because its keys are world-readable; caching this one anywhere but the
   * viewer's own memory would hand a shared proxy something group-private.
   */
  .get('/:id/proof-image', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({
      where: eq(tasks.id, id),
      columns: { groupId: true, proofImageKey: true },
    });
    if (!task?.proofImageKey) throw notFound('No proof photo on that task');

    const member = await client.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, task.groupId), eq(groupMembers.userId, userId)),
      columns: { userId: true },
    });
    // `notFound`, not `forbidden`: a stranger should not learn that a task with
    // this id exists and has a photo on it.
    if (!member) throw notFound('No proof photo on that task');

    const object = await c.env.STORAGE.get(task.proofImageKey);
    if (!object) throw notFound('No proof photo on that task');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  })

  /** Owner marks it done, optionally attaching the proof text or photo (§2.4). */
  .post('/:id/done', zValidator('json', markTaskDoneSchema), async (c) => {
    const id = c.req.param('id');
    const { proofText, proofImageKey } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    assertOwnProofKey(proofImageKey, userId);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    if (task.status === 'approved') throw conflict('That task is already approved');

    // `missed` is allowed to go back to `done`: the day passed, but finishing
    // late and having it reviewed is better than a dead row.
    const claimed = await client
      .update(tasks)
      .set({
        status: 'done',
        doneAt: nowIso(),
        // Finishing stops the clock, which is what lifts the chat lock.
        startedAt: null,
        ...(proofText !== undefined && { proofText: proofText ?? null }),
        ...(proofImageKey !== undefined && { proofImageKey: proofImageKey ?? null }),
      })
      .where(
        and(
          eq(tasks.id, id),
          inArray(tasks.status, ['planned', 'proof_requested', 'missed', 'done']),
        ),
      )
      .returning({ id: tasks.id });

    if (claimed.length === 0) throw conflict('That task has already moved on');

    /**
     * The clock that was running is booked (PRODUCT.md §3.2): its minutes go
     * on the task, and if this was the task's own solo session, the session
     * ends with it. A task finished inside a group session leaves the session
     * running for everyone else.
     */
    if (task.startedAt) {
      await settleTaskClock(client, task, nowIso());
      if (task.sessionId) {
        const session = await client.query.sessions.findFirst({ where: eq(sessions.id, task.sessionId) });
        if (session?.kind === 'solo') await endSession(client, session.id);
      }
    }

    /**
     * Finishing stops the clock, so the room is told for the same reason
     * starting tells it: other members' screens would otherwise keep showing a
     * clock that is no longer running until their next refetch. Cosmetic only —
     * the lock itself is read from D1 per message.
     */
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(task.groupId).noteFocusChange(userId));

    // To the Buddy alone where there is one, rather than to everybody: a
    // notification that reaches four people who cannot act on it is noise.
    const rights = await reviewRightsFor(client, task);
    await enqueuePush(c.env, {
      userIds: rights.reviewerIds,
      title: 'A task is ready to review',
      body: task.title,
      data: { type: 'task_done', taskId: id, groupId: task.groupId, url: '/groups' },
    });

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row });
  })

  /**
   * Starting the clock (§2.4).
   *
   * Two rules, both deliberate. **One running task at a time**, across every
   * group — the point of starting is that it is the thing you are doing now, and
   * three simultaneous commitments is none. And **an estimate is required**,
   * because there is nothing to count down without one; the mobile app does not
   * ask for one, so its tasks simply cannot be started until it is ported.
   *
   * Starting locks the owner out of this group's chat until the task ends. The
   * lock is not stored anywhere: it is `started_at`, read by the chat room.
   */
  .post('/:id/start', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    if (task.estimatedMinutes === null) {
      throw badRequest('Say how long this will take before starting it');
    }
    if (task.status === 'approved' || task.status === 'done') {
      throw conflict('That task is already finished');
    }

    /**
     * Already running, so this is a double tap: nothing to do, and restarting
     * would quietly reset a clock the owner is being held to.
     *
     * Keyed on actually-running rather than on `started_at` alone. A missed task
     * can carry a stale clock — the rollover clears it, but a task started
     * *while* missed was left with one by an earlier version of this handler —
     * and treating that as running made the task permanently unstartable: the
     * write was skipped, the client read the status as not-running, and Start
     * did nothing forever. Reading both columns is also what heals those rows,
     * since the fresh timestamp below overwrites the stale one.
     */
    const alreadyRunning =
      task.startedAt !== null && (task.status === 'planned' || task.status === 'proof_requested');
    if (alreadyRunning) return c.json({ task });

    const running = await client.query.tasks.findFirst({
      where: and(
        eq(tasks.userId, userId),
        isNotNull(tasks.startedAt),
        inArray(tasks.status, ['planned', 'proof_requested']),
      ),
      columns: { id: true, title: true },
    });
    if (running) {
      throw conflict(`Finish or drop "${running.title}" first — one task at a time`);
    }

    /**
     * Starting a missed task is how someone picks it back up, so it stops being
     * missed — and moves to today, which is not bookkeeping: the rollover marks
     * any planned task whose day has passed as missed, and it runs hourly. A
     * revived task left on yesterday's date would be marked missed again within
     * the hour, killing the clock under someone who is working.
     */
    const startedAt = nowIso();
    const revive =
      task.status === 'missed'
        ? { status: 'planned' as const, dueDate: await ownerToday(client, userId) }
        : {};
    await client
      .update(tasks)
      .set({ startedAt, ...revive })
      .where(eq(tasks.id, id));

    /**
     * The clock becomes a session (PRODUCT.md §3.1). If the owner is already
     * in the group's live session, the task joins it; otherwise Start creates
     * a solo session around the task, which is what the button always did
     * under a different name.
     */
    const live = await liveGroupSession(client, task.groupId);
    if (live && (await presentInLiveSession(client, task.groupId, userId))) {
      await attachTask(client, live.id, id);
    } else {
      await startSoloSession(
        client,
        { id, userId, groupId: task.groupId, estimatedMinutes: task.estimatedMinutes },
        startedAt,
      );
    }

    // Best-effort: greys the composer immediately rather than on the next send.
    // Correctness does not depend on it — the room reads the truth per message.
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(task.groupId).noteFocusChange(userId));

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row });
  })

  /**
   * Dropping a started task — the way out of the chat lock.
   *
   * It used to cost points (`ABANDON_PENALTY`); it no longer does
   * (PRODUCT.md §5.2, slice 1). Credits never go down: a penalty currency
   * made people not start at all, and the minutes already worked were real
   * work. The task goes back to being a plan and can be started again; the
   * minutes so far are booked on it, and the session around it ends.
   * `credits` in the response is kept at 0 for the clients that read it.
   */
  .post('/:id/abandon', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    if (task.startedAt === null) throw conflict('That task is not running');

    await settleTaskClock(client, task, nowIso());
    if (task.sessionId) {
      const session = await client.query.sessions.findFirst({ where: eq(sessions.id, task.sessionId) });
      if (session?.kind === 'solo') await endSession(client, session.id);
    }

    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(task.groupId).noteFocusChange(userId));

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row, credits: 0 });
  })

  /** Submitting or updating proof after a reviewer asked for it. */
  .post('/:id/proof', zValidator('json', markTaskDoneSchema), async (c) => {
    const id = c.req.param('id');
    const { proofText, proofImageKey } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    if (task.status === 'approved') throw conflict('That task is already approved');

    if (!proofText?.trim() && !proofImageKey) {
      throw badRequest('Add a note or a photo explaining what you did');
    }

    assertOwnProofKey(proofImageKey, userId);

    // Replacing the photo should not leave the old object paying rent forever,
    // the same rule the avatar upload follows. Only when it is genuinely being
    // replaced: `proofImageKey ?? task.proofImageKey` below keeps the existing
    // one when this submission is text-only.
    if (proofImageKey && task.proofImageKey && task.proofImageKey !== proofImageKey) {
      c.executionCtx.waitUntil(c.env.STORAGE.delete(task.proofImageKey));
    }

    // Submitting proof returns the task to `done`, i.e. back in the queue.
    await client
      .update(tasks)
      .set({
        status: 'done',
        proofText: proofText ?? task.proofText,
        proofImageKey: proofImageKey ?? task.proofImageKey,
        doneAt: nowIso(),
      })
      .where(and(eq(tasks.id, id), ne(tasks.status, 'approved')));

    await notifyGroup(c, client, task.groupId, userId, {
      title: 'Proof added',
      body: task.title,
      data: { type: 'task_proof', taskId: id, url: '/(tabs)/today' },
    });

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row });
  })

  /**
   * A groupmate's nudge to somebody who has not started (PRODUCT.md §3.3):
   * one of four fixed lines, one per sender per task per day, inside the
   * recipient's daily budget. Never to yourself, never about a task already
   * on the clock — a nudge is about starting.
   */
  .post('/:id/nudge', zValidator('json', nudgeTaskSchema), async (c) => {
    const id = c.req.param('id');
    const { template } = c.req.valid('json');
    const fromUserId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId === fromUserId) throw badRequest('You cannot nudge yourself');
    await assertMember(client, task.groupId, fromUserId);
    if (task.startedAt) throw conflict('They have already started');
    if (task.status !== 'planned' && task.status !== 'missed') throw conflict('That task is not waiting to be started');

    const sender = await client.query.users.findFirst({ where: eq(users.id, fromUserId), columns: { displayName: true } });
    const result = await sendBuddyNudge(client, c.env, {
      fromUserId,
      fromName: sender?.displayName ?? 'Someone',
      toUserId: task.userId,
      template,
      taskId: id,
      groupId: task.groupId,
      title: task.title,
    });
    if (!result.ok) throw conflict(result.reason);
    return c.json({ id: result.id, template }, 201);
  })

  /**
   * "Check on me at 7:15" (PRODUCT.md §3.3): the owner asks one groupmate to
   * look at a time. Owner-initiated only, which is what makes it opt-in; the
   * pressure job sends the buddy a push when the time comes.
   */
  .post('/:id/checkin', zValidator('json', requestCheckinSchema), async (c) => {
    const id = c.req.param('id');
    const { buddyUserId, at } = c.req.valid('json');
    const ownerId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== ownerId) throw forbidden('That task is not yours');
    if (buddyUserId === ownerId) throw badRequest('Pick somebody else in the group');
    await assertMember(client, task.groupId, buddyUserId);
    if (Date.parse(at) < Date.now()) throw badRequest('Pick a time that has not passed');
    const owner = await client.query.users.findFirst({ where: eq(users.id, ownerId), columns: { timezone: true } });
    if (localDateOrUtc(owner?.timezone ?? 'UTC', new Date(at)) !== localDateOrUtc(owner?.timezone ?? 'UTC')) {
      throw badRequest('A check-in is for today');
    }
    // The buddy's quiet hours are theirs (PRODUCT.md §5.3): a check-in that
    // would be dropped at delivery is refused now, so the owner knows.
    const buddy = await client.query.users.findFirst({
      where: eq(users.id, buddyUserId),
      columns: { timezone: true, quietHoursStart: true, quietHoursEnd: true, displayName: true },
    });
    if (buddy) {
      const hour = ((): number | null => {
        try {
          return localHour(buddy.timezone, new Date(at));
        } catch {
          return null;
        }
      })();
      if (hour !== null && inQuietHours(hour, buddy.quietHoursStart, buddy.quietHoursEnd)) {
        throw badRequest(`That is inside ${buddy.displayName}'s quiet hours — pick an earlier time`);
      }
    }

    const result = await requestCheckin(client, { ownerId, buddyUserId, taskId: id, at });
    if (!result.ok) throw conflict(result.reason);
    return c.json({ id: result.id, at }, 201);
  })

  /** Every nudge on a task, newest first, for the owner's screen and the group's. */
  .get('/:id/nudges', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);
    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id), columns: { groupId: true } });
    if (!task) throw notFound('No such task');
    await assertMember(client, task.groupId, userId);
    return c.json({ nudges: await nudgesForTask(client, id) });
  })

  /**
   * A buddy reviews: approve with a rating, or send it back for proof.
   *
   * The status transition is claimed with a guarded UPDATE. Only if that claim
   * returns a row do the credits move — that single fact is what makes "first
   * review is final" hold under concurrency.
   */
  .post('/:id/review', zValidator('json', reviewTaskSchema), async (c) => {
    const id = c.req.param('id');
    const review = c.req.valid('json');
    const reviewerId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId === reviewerId) throw forbidden('You cannot review your own task');

    await assertMember(client, task.groupId, reviewerId);

    // Who may review depends on whether the group has named a Buddy (§2.4).
    const rights = await reviewRightsFor(client, task, reviewerId);
    if (!rights.allowed) throw forbidden(rights.reason ?? 'You cannot review that task');

    if (task.status === 'approved') throw conflict('That task has already been reviewed');
    if (task.status !== 'done') {
      throw conflict('That task is not waiting for a review');
    }

    if (review.action === 'request_proof') {
      const claimed = await client
        .update(tasks)
        .set({ status: 'proof_requested' })
        .where(and(eq(tasks.id, id), eq(tasks.status, 'done')))
        .returning({ id: tasks.id });
      if (claimed.length === 0) throw conflict('That task has already been reviewed');

      await client.insert(taskReviews).values({
        id: newId(),
        taskId: id,
        reviewerId,
        action: 'request_proof',
        rating: null,
        comment: review.comment ?? null,
      });
      await countReview(client, reviewerId);

      await enqueuePush(c.env, {
        userIds: [task.userId],
        title: 'Your buddy asked for proof',
        body: task.title,
        data: { type: 'proof_requested', taskId: id, url: '/(tabs)/today' },
      });

      const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
      return c.json({ task: row, award: null });
    }

    // Approve. Claim first, pay second.
    const claimed = await client
      .update(tasks)
      .set({ status: 'approved' })
      .where(and(eq(tasks.id, id), eq(tasks.status, 'done')))
      .returning({ id: tasks.id });
    if (claimed.length === 0) throw conflict('That task has already been reviewed');

    await client.insert(taskReviews).values({
      id: newId(),
      taskId: id,
      reviewerId,
      action: 'approve',
      rating: review.rating,
      comment: review.comment ?? null,
    });

    const award = await awardApproval(client, {
      ownerId: task.userId,
      reviewerId,
      taskId: id,
      dueDate: task.dueDate,
      rating: review.rating,
      actualMinutes: task.actualMinutes,
    });

    // Badges derive from stats, so they are synced after the award, outside its
    // atomic batch — see services/badges.ts.
    const [ownerBadges] = await Promise.all([
      syncBadges(client, task.userId),
      syncBadges(client, reviewerId),
    ]);

    await enqueuePush(c.env, {
      userIds: [task.userId],
      title:
        review.rating > 0
          ? `Approved · +${award.credits + award.dailyBonus} credits`
          : 'Your task was reviewed',
      body: task.title,
      data: { type: 'task_approved', taskId: id, url: '/(tabs)/today' },
    });

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row, award: { ...award, badges: ownerBadges } });
  })

  /** The review history for one task, so the owner can see what was asked. */
  .get('/:id/reviews', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    await assertMember(client, task.groupId, userId);

    const rows = await client
      .select({
        id: taskReviews.id,
        action: taskReviews.action,
        rating: taskReviews.rating,
        comment: taskReviews.comment,
        createdAt: taskReviews.createdAt,
        reviewerHandle: users.handle,
        reviewerDisplayName: users.displayName,
      })
      .from(taskReviews)
      .innerJoin(users, eq(users.id, taskReviews.reviewerId))
      .where(eq(taskReviews.taskId, id))
      .orderBy(taskReviews.createdAt);

    return c.json({ reviews: rows });
  });

/** Notifies a group's other members. Used when a task needs someone's attention. */
async function notifyGroup(
  c: { env: AppEnv['Bindings'] },
  client: Db,
  groupId: string,
  exceptUserId: string,
  message: { title: string; body: string; data: Record<string, string> },
): Promise<void> {
  const members = await client
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, exceptUserId)));

  // A member who muted the group asked not to be buzzed by it (PRODUCT.md §6.1).
  const muted = await mutedIdsFor(client, groupId);
  await enqueuePush(c.env, {
    userIds: members.map((m) => m.userId).filter((id) => !muted.has(id)),
    ...message,
  });
}
