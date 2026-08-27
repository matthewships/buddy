import { eq, sql } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';

import { LAST_SEEN_THROTTLE_MS } from '@buddy/shared';

import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { AppEnv, Env } from '../env.js';
import { unauthorized } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { verifyAccessToken } from '../services/tokens.js';

/**
 * The signing secret. Absent means misconfiguration, not an unauthenticated
 * request, so it fails loudly rather than rejecting every login as invalid.
 */
export function requireSecret(env: Env): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set — run `wrangler secret put JWT_SECRET`');
  }
  return env.JWT_SECRET;
}

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Requires a valid access token and puts the user id on the context.
 *
 * Also refreshes `last_seen_at`, which powers the "Active now" indicator in the
 * buddy directory (§4.2). The write is throttled in SQL — one UPDATE whose
 * WHERE clause skips rows touched within the last minute — so an active client
 * polling every 5 seconds costs one cheap no-op query rather than a write.
 * It runs after the handler via waitUntil so it never adds latency.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearer(c.req.header('authorization'));
  if (!token) throw unauthorized();

  const userId = await verifyAccessToken(token, requireSecret(c.env));
  if (!userId) throw unauthorized('Your session expired — sign in again');

  const client = db(c.env.DB);

  // A deleted account keeps working until its access token expires unless the
  // token is checked against the row, so verify the user still exists.
  const user = await client.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, deletedAt: true },
  });
  if (!user || user.deletedAt !== null) throw unauthorized('That account no longer exists');

  c.set('userId', userId);

  c.executionCtx.waitUntil(
    client
      .update(users)
      .set({ lastSeenAt: nowIso() })
      .where(
        sql`${users.id} = ${userId} AND (${users.lastSeenAt} IS NULL OR ${users.lastSeenAt} < ${new Date(
          Date.now() - LAST_SEEN_THROTTLE_MS,
        ).toISOString()})`,
      ),
  );

  await next();
});

/** The authenticated user id. Only valid downstream of `requireAuth`. */
export function currentUserId(c: { get: (k: 'userId') => string | undefined }): string {
  const userId = c.get('userId');
  if (!userId) throw unauthorized();
  return userId;
}
