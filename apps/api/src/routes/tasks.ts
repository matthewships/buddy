import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
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
import { awardApproval, countReview } from '../services/credits.js';
import { enqueuePush } from '../services/push.js';
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
   * `mine` (default) is the owner's own tasks; `review` is the cross-group queue
   * of buddies' tasks waiting on a review. The Today tab needs both, and a
   * per-group round trip would be N requests for N groups.
   */
  scope: z.enum(['mine', 'review']).default('mine'),
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

    const scopeConditions =
      scope === 'review'
        ? [
            // Someone else's task, in a group I'm in, waiting on a review.
            ne(tasks.userId, userId),
            eq(tasks.status, 'done'),
          ]
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
    const { groupId, title, notes, dueDate } = c.req.valid('json');
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

    await notifyGroup(c, client, task.groupId, userId, {
      title: 'A task is ready to review',
      body: task.title,
      data: { type: 'task_done', taskId: id, url: '/(tabs)/today' },
    });

    const row = await client.query.tasks.findFirst({ where: eq(tasks.id, id) });
    return c.json({ task: row });
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

    // Any other member of the group may review (§2.4).
    await assertMember(client, task.groupId, reviewerId);

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
