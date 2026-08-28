import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { BlankEnv, ExtractSchema } from 'hono/types';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import type { AppEnv } from './env.js';
import type { ApiErrorBody } from './lib/errors.js';
import { db } from './db/client.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes, chatSocketRoutes } from './routes/chat.js';
import { buddyRequestRoutes } from './routes/buddy-requests.js';
import { buddyRoutes } from './routes/buddies.js';
import { groupRoutes, inviteRoutes } from './routes/groups.js';
import { meRoutes } from './routes/me.js';
import { taskRoutes } from './routes/tasks.js';
import { userRoutes } from './routes/users.js';
import { runRollover } from './jobs/rollover.js';
import { deliverPush, type PushMessage } from './services/push.js';

/**
 * The Buddy API (§3): a single Worker with three entry points — `fetch` for
 * REST plus the chat WebSocket upgrade, `queue` for push delivery, and
 * `scheduled` for the rollover and leaderboard crons.
 *
 * Routes are mounted onto one Hono app and the app's type is exported as
 * `AppType`, which the Expo client consumes through `hc<AppType>()` — that is
 * what makes the request and response types check at compile time across the
 * repo (§4.4).
 */
const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', secureHeaders());
// The mobile app is not a browser origin, but Expo web and the dev tools are.
app.use('/api/*', cors({ origin: '*', maxAge: 86_400 }));

const routes = app
  .get('/health', (c) =>
    c.json({
      status: 'ok' as const,
      environment: c.env.ENVIRONMENT,
      time: new Date().toISOString(),
    }),
  )
  /**
   * Confirms the D1 binding and the applied migrations from inside the Worker.
   * Phase 0's exit criteria include a real query against real D1, not just a
   * successful build.
   */
  .get('/health/db', async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT count(*) AS tables FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).all<{ tables: number }>();
    return c.json({ status: 'ok' as const, tables: results[0]?.tables ?? 0 });
  })
  .route('/api/auth', authRoutes)
  .route('/api/me', meRoutes)
  .route('/api/users', userRoutes)
  .route('/api/buddies', buddyRoutes)
  .route('/api/buddy-requests', buddyRequestRoutes)
  .route('/api/groups', groupRoutes)
  .route('/api/invites', inviteRoutes)
  .route('/api/tasks', taskRoutes)
  // Group-scoped chat reads share the /api/groups prefix and its bearer auth.
  .route('/api/groups', chatRoutes)
  // The socket upgrade sits outside /api/groups: it authenticates with a
  // ticket, and that prefix's bearer middleware would reject it first.
  .route('/api/chat', chatSocketRoutes);

/** Any thrown ApiError already carries its JSON body; everything else is a 500. */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    if (res) return res;
  }
  console.error('unhandled error', err);
  const body: ApiErrorBody = {
    error: { code: 'internal', message: 'Something went wrong' },
  };
  return c.json(body, 500);
});

app.notFound((c) => {
  const body: ApiErrorBody = { error: { code: 'not_found', message: 'Not found' } };
  return c.json(body, 404);
});

/**
 * The contract the Expo app compiles against.
 *
 * Deliberately stripped of the Bindings generic: `typeof routes` would carry
 * `Cloudflare.Env` with it, which would drag the Worker's runtime types into
 * the React Native tsconfig, where they don't resolve and don't belong. Only
 * the route schema — paths, methods, input and output shapes — crosses the
 * package boundary, which is all `hc<AppType>()` needs.
 */
export type AppType = Hono<BlankEnv, ExtractSchema<typeof routes>, '/'>;

export { GroupChat } from './durable/GroupChat.js';

export default {
  fetch: app.fetch,

  /**
   * Push delivery (§4.6). Kept off the request path so a slow Expo response
   * never delays the action that triggered it, and so failures retry.
   *
   * A thrown error retries the whole batch, which is the right default for a
   * transient Expo outage. Individual bad tokens are handled inside
   * deliverPush by deleting them, not by failing the batch.
   */
  async queue(batch, env) {
    const messages = batch.messages.map((m) => m.body as PushMessage);
    try {
      const { sent, removed } = await deliverPush(env, db(env.DB), messages);
      console.log(`[push] delivered=${sent} pruned=${removed} batch=${batch.messages.length}`);
      batch.ackAll();
    } catch (error) {
      console.error('[push:batch-failed]', error);
      batch.retryAll();
    }
  },

  /**
   * Cron triggers (§4.9). Hourly, because "local midnight" happens at a
   * different UTC hour in every timezone.
   *
   * The job itself is idempotent rather than schedule-exact — see
   * jobs/rollover.ts — so a dropped firing self-heals on the next hour instead
   * of silently skipping a day's rollover for a whole timezone.
   */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const result = await runRollover(db(env.DB));
        console.log(
          `[rollover] timezones=${result.timezones} missed=${result.missed} streaksReset=${result.streaksReset}`,
        );
      })(),
    );
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
