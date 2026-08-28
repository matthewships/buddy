import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { leaderboardQuerySchema } from '@buddy/shared';

import { db } from '../db/client.js';
import type { AppEnv } from '../env.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { myRank, readLeaderboard } from '../services/leaderboard.js';

export const leaderboardRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', zValidator('query', leaderboardQuerySchema), async (c) => {
    const { scope } = c.req.valid('query');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const [board, mine] = await Promise.all([
      // Stale-while-revalidate: the refresh runs after the response, so a user
      // never waits for a recomputation.
      readLeaderboard(client, c.env.CACHE, scope, (work) => c.executionCtx.waitUntil(work)),
      // Computed live: the snapshot only holds the top 100, and a user outside
      // it would otherwise be told they have no rank.
      myRank(client, userId, scope),
    ]);

    return c.json({
      scope,
      entries: board.entries,
      generatedAt: board.generatedAt,
      me: mine,
    });
  });
