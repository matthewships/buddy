import { RATE_LIMITS } from '@buddy/shared';

import { rateLimited } from './errors.js';

/**
 * Fixed-window rate limiting backed by KV (§4.3).
 *
 * KV rather than the platform Rate Limiting binding because the limits here are
 * per email address and per IP rather than per-colo, and because a KV counter is
 * inspectable and testable with the same bindings the rest of the suite uses.
 *
 * Fixed windows allow a burst of up to 2x the limit across a boundary. That is
 * acceptable for the endpoints being protected — they exist to stop credential
 * stuffing and email flooding, not to meter a paid API — and it costs one KV
 * read plus one write instead of the sorted-set bookkeeping a sliding window
 * needs.
 */

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const { limit, windowMs } = RATE_LIMITS[name];
  const window = Math.floor(Date.now() / windowMs);
  const key = `rl:${name}:${identifier}:${window}`;

  const current = Number((await kv.get(key)) ?? '0');
  const resetAt = (window + 1) * windowMs;

  if (current >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  await kv.put(key, String(current + 1), {
    // Expire slightly past the window so a stale counter cannot outlive it.
    expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) + 60),
  });

  return { allowed: true, remaining: limit - current - 1, resetAt };
}

/** Throws a 429 when the limit is exhausted. */
export async function enforceRateLimit(
  kv: KVNamespace,
  name: RateLimitName,
  identifier: string,
): Promise<void> {
  const result = await checkRateLimit(kv, name, identifier);
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    throw rateLimited(`Too many attempts — try again in ${seconds}s`);
  }
}

/** The client IP, as Cloudflare reports it. Falls back to a constant so a
 * missing header degrades to a shared bucket rather than no limit at all. */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}
