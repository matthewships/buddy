import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, createPostSchema, reactToPostSchema } from '@buddy/shared';

import { db } from '../db/client.js';
import { postReactions, posts, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { enforceRateLimit } from '../lib/rate-limit.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';

/**
 * The Feed (§2.7).
 *
 * Global: every signed-in user sees every post. That is a deliberate trade
 * against a group-scoped feed — it is the one screen a brand-new account with no
 * group yet has something to look at, and the cost is that it is a public
 * surface, which is why `REPORT_TARGETS` includes 'post' from the first day
 * rather than later.
 *
 * Paging is keyset on the id, which is a ULID and therefore already in creation
 * order. OFFSET would skip or repeat posts as new ones land at the top, which on
 * a feed is constantly.
 */

const feedQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const postRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', zValidator('query', feedQuerySchema), async (c) => {
    const { cursor, limit } = c.req.valid('query');
    const viewerId = currentUserId(c);
    const client = db(c.env.DB);

    const rows = await client
      .select({
        id: posts.id,
        imageKey: posts.imageKey,
        caption: posts.caption,
        createdAt: posts.createdAt,
        authorId: users.id,
        authorHandle: users.handle,
        authorName: users.displayName,
        authorAvatarKey: users.avatarKey,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(
        and(
          isNull(posts.deletedAt),
          // A deleted account's posts go with it, but the soft delete leaves the
          // row — so exclude them here too rather than showing "Deleted account".
          isNull(users.deletedAt),
          ...(cursor ? [lt(posts.id, cursor)] : []),
        ),
      )
      .orderBy(desc(posts.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Reaction counts for the whole page in one query rather than per post.
    const counts = page.length
      ? await client
          .select({
            postId: postReactions.postId,
            reaction: postReactions.reaction,
            count: sql<number>`count(*)`,
            mine: sql<number>`sum(CASE WHEN ${postReactions.userId} = ${viewerId} THEN 1 ELSE 0 END)`,
          })
          .from(postReactions)
          .where(
            sql`${postReactions.postId} IN (${sql.join(
              page.map((row) => sql`${row.id}`),
              sql`, `,
            )})`,
          )
          .groupBy(postReactions.postId, postReactions.reaction)
      : [];

    const byPost = new Map<string, { reaction: string; count: number; mine: boolean }[]>();
    for (const row of counts) {
      const list = byPost.get(row.postId) ?? [];
      list.push({ reaction: row.reaction, count: Number(row.count), mine: Number(row.mine) > 0 });
      byPost.set(row.postId, list);
    }

    return c.json({
      posts: page.map((row) => ({
        id: row.id,
        imageKey: row.imageKey,
        caption: row.caption,
        createdAt: row.createdAt,
        author: {
          id: row.authorId,
          handle: row.authorHandle,
          displayName: row.authorName,
          avatarKey: row.authorAvatarKey,
        },
        reactions: byPost.get(row.id) ?? [],
        mine: row.authorId === viewerId,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    });
  })

  .post('/', zValidator('json', createPostSchema), async (c) => {
    const { imageKey, caption } = c.req.valid('json');
    const userId = currentUserId(c);
    await enforceRateLimit(c.env.CACHE, 'post', userId);

    // The key is client-supplied, so re-check ownership rather than trusting it
    // — the same rule the avatar upload applies.
    if (!imageKey.startsWith(`posts/${userId}/`)) {
      throw badRequest('That upload key is not yours');
    }

    const id = newId();
    await db(c.env.DB)
      .insert(posts)
      .values({ id, userId, imageKey, caption: caption ?? null });

    return c.json({ id, imageKey, caption: caption ?? null }, 201);
  })

  /**
   * Reacting is a toggle: the same emoji twice removes it. One endpoint rather
   * than an add and a remove, because the client knows which emoji was tapped
   * and should not have to track which state it was in.
   */
  .post('/:id/reactions', zValidator('json', reactToPostSchema), async (c) => {
    const postId = c.req.param('id');
    const { reaction } = c.req.valid('json');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const post = await client.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post || post.deletedAt !== null) throw notFound('No such post');

    const removed = await client
      .delete(postReactions)
      .where(
        and(
          eq(postReactions.postId, postId),
          eq(postReactions.userId, userId),
          eq(postReactions.reaction, reaction),
        ),
      )
      .returning({ postId: postReactions.postId });

    if (removed.length === 0) {
      await client.insert(postReactions).values({ postId, userId, reaction });
    }

    return c.json({ reaction, on: removed.length === 0 });
  })

  /** Removing your own post. Soft, so its reactions keep their foreign keys. */
  .delete('/:id', async (c) => {
    const postId = c.req.param('id');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const post = await client.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post) throw notFound('No such post');
    if (post.userId !== userId) throw forbidden('That post is not yours');

    await client.update(posts).set({ deletedAt: nowIso() }).where(eq(posts.id, postId));
    c.executionCtx.waitUntil(c.env.STORAGE.delete(post.imageKey));

    return c.json({ ok: true as const });
  });
