import { and, eq, isNull } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';

import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { refreshTokens } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { isoIn, nowIso } from '../lib/time.js';

/**
 * Session tokens (§4.3).
 *
 * Access: HS256 JWT, 15 minutes, stateless — verified without touching D1.
 * Refresh: 30 days, opaque random string, stored only as a SHA-256 hash and
 * rotated on every use. Tokens are grouped into a *family*; presenting a token
 * that has already been rotated away revokes the entire family, which is the
 * standard response to a stolen refresh token.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AccessClaims {
  sub: string;
  exp: number;
  iat: number;
}

export async function signAccessToken(userId: string, secret: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: userId,
      iat: nowSeconds,
      exp: nowSeconds + Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    },
    secret,
    'HS256',
  );
}

/** Returns the user id, or null if the token is invalid, expired or malformed. */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<string | null> {
  try {
    const claims = (await verify(token, secret, 'HS256')) as unknown as AccessClaims;
    return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Starts a new session: a fresh family plus its first refresh token. */
export async function issueSession(
  db: Db,
  secret: string,
  userId: string,
): Promise<TokenPair> {
  return mintRefresh(db, secret, userId, newId());
}

async function mintRefresh(
  db: Db,
  secret: string,
  userId: string,
  familyId: string,
): Promise<TokenPair> {
  const refreshToken = randomToken();

  await db.insert(refreshTokens).values({
    id: newId(),
    userId,
    familyId,
    tokenHash: await sha256Hex(refreshToken),
    expiresAt: isoIn(REFRESH_TOKEN_TTL_MS),
  });

  return {
    accessToken: await signAccessToken(userId, secret),
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
  };
}

export class RefreshError extends Error {}

/**
 * Rotates a refresh token.
 *
 * Three failure modes, deliberately distinguished internally even though the
 * caller reports one generic 401:
 * - unknown hash: never issued, or already pruned
 * - already revoked: replay of a rotated token, so the family is compromised
 *   and every token in it is revoked
 * - expired: past its 30 days
 */
export async function rotateSession(
  db: Db,
  secret: string,
  presentedToken: string,
): Promise<TokenPair> {
  const tokenHash = await sha256Hex(presentedToken);

  const existing = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
  });

  if (!existing) throw new RefreshError('unknown refresh token');

  if (existing.revokedAt !== null) {
    // Replay: whoever holds this also held a token we already rotated away.
    await revokeFamily(db, existing.familyId);
    throw new RefreshError('refresh token reuse — family revoked');
  }

  if (Date.parse(existing.expiresAt) <= Date.now()) {
    throw new RefreshError('refresh token expired');
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: nowIso() })
    .where(eq(refreshTokens.id, existing.id));

  return mintRefresh(db, secret, existing.userId, existing.familyId);
}

export async function revokeFamily(db: Db, familyId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: nowIso() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/** Used by logout (single session) — revokes just the presented token's family. */
export async function revokeByToken(db: Db, presentedToken: string): Promise<void> {
  const row = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, await sha256Hex(presentedToken)),
  });
  if (row) await revokeFamily(db, row.familyId);
}

/** Used by password reset and password change — signs out everywhere (§4.3). */
export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: nowIso() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
