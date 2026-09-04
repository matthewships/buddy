import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { nudgeText, replyCheckinSchema } from '@buddy/shared';

import { db } from '../db/client.js';
import { nudges, tasks, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { localDayFor } from '../services/pressure.js';
import { enqueuePush } from '../services/push.js';

/**
 * The reply to a requested check-in (PRODUCT.md §3.3): the buddy who was
 * asked answers with one of three lines, once, and it lands on the owner's
 * task. Not a conversation — that is what the chat is for once the clock
 * stops — but the sentence that says somebody looked.
 */
export const nudgeRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .post('/:id/reply', zValidator('json', replyCheckinSchema), async (c) => {
    const id = c.req.param('id');
    const { template } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const checkin = await client.query.nudges.findFirst({ where: and(eq(nudges.id, id), eq(nudges.kind, 'checkin')) });
    if (!checkin) throw notFound('No such check-in');
    if (checkin.fromUserId !== userId) throw forbidden('That check-in was not asked of you');
    if (!checkin.sentAt) throw conflict('That check-in has not come round yet');

    const replied = await client.query.nudges.findFirst({
      where: and(
        eq(nudges.kind, 'checkin_reply'),
        eq(nudges.fromUserId, userId),
        eq(nudges.toUserId, checkin.toUserId),
        checkin.taskId ? eq(nudges.taskId, checkin.taskId) : eq(nudges.day, checkin.day),
        eq(nudges.day, checkin.day),
      ),
      columns: { id: true },
    });
    if (replied) throw conflict('You already replied');

    const [buddy, task] = await Promise.all([
      client.query.users.findFirst({ where: eq(users.id, userId), columns: { displayName: true } }),
      checkin.taskId ? client.query.tasks.findFirst({ where: eq(tasks.id, checkin.taskId), columns: { title: true, groupId: true } }) : Promise.resolve(undefined),
    ]);

    const replyId = newId();
    await client.insert(nudges).values({
      id: replyId,
      kind: 'checkin_reply',
      taskId: checkin.taskId,
      fromUserId: userId,
      toUserId: checkin.toUserId,
      template,
      day: await localDayFor(client, checkin.toUserId),
      sentAt: nowIso(),
    });
    await enqueuePush(c.env, {
      userIds: [checkin.toUserId],
      title: `${buddy?.displayName ?? 'Your buddy'}: ${nudgeText(template)}`,
      body: task?.title ?? '',
      data: { type: 'checkin_reply', nudgeId: replyId, ...(task?.groupId ? { groupId: task.groupId, url: `/groups/${task.groupId}` } : {}) },
    });
    return c.json({ id: replyId, template }, 201);
  });
