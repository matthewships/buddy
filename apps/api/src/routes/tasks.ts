import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  createTaskSchema,
  localDateSchema,
  markTaskDoneSchema,
  reviewTaskSchema,
  ulidSchema,
  updateTaskSchema,
} from '@buddy/shared';

import { db, type Db } from '../db/client.js';
import { groupMembers, groups, taskReviews, tasks, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { localDate, nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { syncBadges } from '../services/badges.js';
import { awardApproval, chargeAbandon, countReview } from '../services/credits.js';
import { enqueuePush } from '../services/push.js';
import { reviewRightsFor } from '../services/review-rights.js';
import { assertMember } from './groups.js';

/**
 * Daily tasks and the review loop (§2.4, §4.8).
 *
 * ```
 * planned ──done──▶ done ──approve(rating)──▶ approved
 *    │                │
 *    │                └──request_proof──▶ proof_requested ──proof──▶ done
 *    └── local midnight passes (hourly cron) ──▶ missed
 * ```
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

const taskColumns = {
  id: tasks.id,
  userId: tasks.userId,
  groupId: tasks.groupId,
  title: tasks.title,
  notes: tasks.notes,
  dueDate: tasks.dueDate,
  status: tasks.status,
  proofText: tasks.proofText,
  proofImageKey: tasks.proofImageKey,
  doneAt: tasks.doneAt,
  createdAt: tasks.createdAt,
};

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

    return c.json({ tasks: rows });
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
    if (task.status !== 'planned') {
      throw conflict('That task is already under review — you can update the proof instead');
    }

    if (patch.dueDate && patch.dueDate < (await ownerToday(client, userId))) {
      throw badRequest("That day has already passed — plan for today or later");
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
      })
      .where(and(eq(tasks.id, id), eq(tasks.status, 'planned')));

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
    return c.json({ ok: true as const });
  })

  /** Owner marks it done, optionally attaching the proof text (§2.4). */
  .post('/:id/done', zValidator('json', markTaskDoneSchema), async (c) => {
    const id = c.req.param('id');
    const { proofText, proofImageKey } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

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
    if (task.startedAt !== null) return c.json({ task });

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

    const startedAt = nowIso();
    await client.update(tasks).set({ startedAt }).where(eq(tasks.id, id));

    // Best-effort: greys the composer immediately rather than on the next send.
    // Correctness does not depend on it — the room reads the truth per message.
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(task.groupId).noteFocusChange(userId));

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row });
  })

  /**
   * Dropping a started task — the way out of the chat lock, and the only action
   * in Buddy that costs points.
   *
   * The task itself is untouched apart from the clock: it goes back to being a
   * plan, and can be started again later. What is charged is the broken
   * commitment, not the task.
   */
  .post('/:id/abandon', async (c) => {
    const id = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const task = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!task) throw notFound('No such task');
    if (task.userId !== userId) throw forbidden('That task is not yours');
    if (task.startedAt === null) throw conflict('That task is not running');

    const startedAt = task.startedAt;
    // Clear the clock first: the charge is idempotent on (task, start), so a
    // failure after this point cannot double-charge, while the reverse order
    // could leave someone charged and still locked.
    await client.update(tasks).set({ startedAt: null }).where(eq(tasks.id, id));
    const charged = await chargeAbandon(client, userId, id, startedAt);

    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(task.groupId).noteFocusChange(userId));

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row, credits: charged });
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

  await enqueuePush(c.env, { userIds: members.map((m) => m.userId), ...message });
}
