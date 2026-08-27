import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  type EmailCodePurpose,
} from '@buddy/shared';

import type { Db } from '../db/client.js';
import { emailCodes } from '../db/schema.js';
import { badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { isoIn, nowIso } from '../lib/time.js';

/**
 * Six-digit email codes for verification and password reset (§4.3).
 *
 * Codes are stored as an HMAC-SHA256 keyed with the server secret, never as a
 * plain SHA-256: a six-digit code has only a million possibilities, so an
 * unkeyed digest of a leaked table could be reversed instantly. Keyed, it
 * cannot be attacked without the secret as well.
 */

const encoder = new TextEncoder();

async function hashCode(code: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(code));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A uniformly distributed numeric code — modulo of a random byte would bias it. */
export function generateCode(): string {
  const max = 10 ** EMAIL_CODE_LENGTH;
  const limit = Math.floor(0xffffffff / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0] ?? 0;
  } while (value >= limit);
  return String(value % max).padStart(EMAIL_CODE_LENGTH, '0');
}

/**
 * Issues a code, invalidating any earlier unconsumed code for the same purpose
 * so an older email cannot still be used after a resend.
 */
export async function issueCode(
  db: Db,
  secret: string,
  userId: string,
  purpose: EmailCodePurpose,
): Promise<string> {
  const code = generateCode();

  await db
    .update(emailCodes)
    .set({ consumedAt: nowIso() })
    .where(
      and(
        eq(emailCodes.userId, userId),
        eq(emailCodes.purpose, purpose),
        isNull(emailCodes.consumedAt),
      ),
    );

  await db.insert(emailCodes).values({
    id: newId(),
    userId,
    purpose,
    codeHash: await hashCode(code, secret),
    expiresAt: isoIn(EMAIL_CODE_TTL_MS),
  });

  return code;
}

/**
 * Consumes a code. Wrong guesses increment `attempts`, and the code dies once
 * the cap is reached, so a six-digit space cannot be walked online.
 *
 * Returns true only if the code was valid, unexpired, unconsumed and under the
 * attempt cap; the code is marked consumed in the same step so it cannot be
 * replayed.
 */
export async function consumeCode(
  db: Db,
  secret: string,
  userId: string,
  purpose: EmailCodePurpose,
  code: string,
): Promise<boolean> {
  const row = await db.query.emailCodes.findFirst({
    where: and(
      eq(emailCodes.userId, userId),
      eq(emailCodes.purpose, purpose),
      isNull(emailCodes.consumedAt),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  if (!row) throw badRequest('That code is no longer valid — request a new one');

  if (row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    throw badRequest('Too many incorrect attempts — request a new code');
  }

  if (Date.parse(row.expiresAt) <= Date.now()) {
    throw badRequest('That code has expired — request a new one');
  }

  const matches = row.codeHash === (await hashCode(code, secret));

  if (!matches) {
    await db
      .update(emailCodes)
      .set({ attempts: sql`${emailCodes.attempts} + 1` })
      .where(eq(emailCodes.id, row.id));
    return false;
  }

  await db.update(emailCodes).set({ consumedAt: nowIso() }).where(eq(emailCodes.id, row.id));
  return true;
}
