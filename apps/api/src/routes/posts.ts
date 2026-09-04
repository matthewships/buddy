import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createPostSchema,
  createReplySchema,
  reactToPostSchema,
} from '@buddy/shared';

import { db } from '../db/client.js';
import { postReactions, postReplies, posts, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { enforceRateLimit } from '../lib/rate-limit.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { blockedIdsFor } from '../services/blocks.js';
import { enqueuePush } from '../services/push.js';

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

/**
 * The stored image key as clients see it.
 *
 * `posts.image_key` is NOT NULL and a text-only post stores `''` — see the
 * column comment in db/schema.ts for why that constraint cannot be dropped
 * without risking every reaction in the database. This is the one place the
 * sentinel is translated, so nothing above the route layer knows about it.
 */
function imageKeyOf(stored: string): string | null {
  return stored === '' ? null : stored;
}

/** Replies are a short flat list, so the whole list is one response. */
const MAX_REPLIES_RETURNED = 200;

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

    // Mutual invisibility (PRODUCT.md §6.1): a blocked pair sees neither
    // side's posts. Filtered in the query, so paging stays correct.
    const blockedIds = await blockedIdsFor(client, viewerId);

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
          ...(blockedIds.length ? [notInArray(posts.userId, blockedIds)] : []),
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

    /**
     * The page's replies, in one query for the same reason the reaction counts
     * are: a page of twenty posts should not be twenty-one round trips.
     *
     * This used to select `count(*)` alone, which was enough when a reply could
     * only be read by opening a sheet. It is not enough now the feed shows the
     * last couple under each post — a conversation nobody can see is a
     * conversation nobody joins, and every feed people already use puts the
     * most recent comments right there under the picture.
     *
     * Rows rather than a window function, and the count derived from them:
     * replies are capped per post and short (see the endpoint below), so the
     * page's whole set is small and bounded, and grouping in JS keeps this on
     * the query builder every other read here uses.
     *
     * It joins users and skips deleted accounts because the replies endpoint
     * does — a bubble reading "3 replies" over a sheet showing two would be a
     * bug you could only find by counting.
     */
    const replyRows = page.length
      ? await client
          .select({
            postId: postReplies.postId,
            id: postReplies.id,
            body: postReplies.body,
            createdAt: postReplies.createdAt,
            authorId: users.id,
            authorHandle: users.handle,
            authorName: users.displayName,
            authorAvatarKey: users.avatarKey,
          })
          .from(postReplies)
          .innerJoin(users, eq(users.id, postReplies.userId))
          .where(
            and(
              isNull(users.deletedAt),
              sql`${postReplies.postId} IN (${sql.join(
                page.map((row) => sql`${row.id}`),
                sql`, `,
              )})`,
            ),
          )
          .orderBy(postReplies.createdAt)
      : [];

    const repliesByPost = new Map<string, typeof replyRows>();
    for (const row of replyRows) {
      const bucket = repliesByPost.get(row.postId);
      if (bucket) bucket.push(row);
      else repliesByPost.set(row.postId, [row]);
    }

    return c.json({
      posts: page.map((row) => ({
        id: row.id,
        imageKey: imageKeyOf(row.imageKey),
        caption: row.caption,
        createdAt: row.createdAt,
        author: {
          id: row.authorId,
          handle: row.authorHandle,
          displayName: row.authorName,
          avatarKey: row.authorAvatarKey,
        },
        reactions: byPost.get(row.id) ?? [],
        replyCount: (repliesByPost.get(row.id) ?? []).length,
        /**
         * The last two, still oldest-first. Two because that is what fits under
         * a post without turning the feed into a thread — the rest are one tap
         * away, which is the bargain every established feed strikes.
         */
        replyPreview: (repliesByPost.get(row.id) ?? []).slice(-2).map((reply) => ({
          id: reply.id,
          body: reply.body,
          createdAt: reply.createdAt,
          author: {
            id: reply.authorId,
            handle: reply.authorHandle,
            displayName: reply.authorName,
            avatarKey: reply.authorAvatarKey,
          },
        })),
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
    // — the same rule the avatar upload applies. Only when there is one: the
    // schema already guarantees a post carries a photo or words.
    if (imageKey && !imageKey.startsWith(`posts/${userId}/`)) {
      throw badRequest('That upload key is not yours');
    }

    const id = newId();
    await db(c.env.DB)
      .insert(posts)
      // `''` is the no-photo sentinel; see `imageKeyOf`.
      .values({ id, userId, imageKey: imageKey ?? '', caption: caption ?? null });

    return c.json({ id, imageKey: imageKey ?? null, caption: caption ?? null }, 201);
  })

  /**
   * The replies on one post, oldest first — which is the order they were said
   * in, and the only order a flat list of five wants.
   *
   * Capped rather than paged: replies are short and few, and a cursor on a list
   * that is almost always under ten is machinery with nothing to do.
   */
  .get('/:id/replies', async (c) => {
    const postId = c.req.param('id');
    const client = db(c.env.DB);

    const post = await client.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post || post.deletedAt !== null) throw notFound('No such post');

    const rows = await client
      .select({
        id: postReplies.id,
        body: postReplies.body,
        createdAt: postReplies.createdAt,
        authorId: users.id,
        authorHandle: users.handle,
        authorName: users.displayName,
        authorAvatarKey: users.avatarKey,
      })
      .from(postReplies)
      .innerJoin(users, eq(users.id, postReplies.userId))
      // A deleted account's replies go with it, the same as its posts.
      .where(and(eq(postReplies.postId, postId), isNull(users.deletedAt)))
      .orderBy(postReplies.createdAt)
      .limit(MAX_REPLIES_RETURNED);

    return c.json({
      replies: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        author: {
          id: row.authorId,
          handle: row.authorHandle,
          displayName: row.authorName,
          avatarKey: row.authorAvatarKey,
        },
      })),
    });
  })

  .post('/:id/replies', zValidator('json', createReplySchema), async (c) => {
    const postId = c.req.param('id');
    const { body } = c.req.valid('json');
    const userId = currentUserId(c);
    await enforceRateLimit(c.env.CACHE, 'reply', userId);

    const client = db(c.env.DB);
    const post = await client.query.posts.findFirst({ where: eq(posts.id, postId) });
    if (!post || post.deletedAt !== null) throw notFound('No such post');

    const id = newId();
    await client.insert(postReplies).values({ id, postId, userId, body });

    // Somebody replying to you is worth knowing about; replying to yourself is
    // not. One recipient, so this is not the group broadcast the tasks use.
    if (post.userId !== userId) {
      await enqueuePush(c.env, {
        userIds: [post.userId],
        title: 'Someone replied to your post',
        body,
        data: { type: 'post_reply', postId, url: '/feed' },
      });
    }

    return c.json({ id, body, createdAt: nowIso() }, 201);
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
    // Only when there is one: a text-only post's key is the `''` sentinel, and
    // asking R2 to delete an empty key is a round trip that can only fail.
    if (post.imageKey) c.executionCtx.waitUntil(c.env.STORAGE.delete(post.imageKey));

    return c.json({ ok: true as const });
  });
