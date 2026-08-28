import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PBKDF2_ITERATIONS_PER_ROUND,
  PBKDF2_KEY_BYTES,
  PBKDF2_ROUNDS,
  PBKDF2_SALT_BYTES,
} from '@buddy/shared';

import { badRequest } from '../lib/errors.js';

/**
 * Password hashing (§4.3): PBKDF2-SHA256 via WebCrypto. bcrypt and argon2 would
 * need WASM and are CPU-heavy on Workers; PBKDF2 is native here.
 *
 * The 600,000 iterations OWASP recommends cannot be requested in one call — the
 * Workers runtime rejects anything above 100,000, and Miniflare does not enforce
 * that limit, so it only appears on a real deploy. The work factor is reached by
 * chaining rounds instead; see PBKDF2_ROUNDS in packages/shared/src/limits.ts
 * for why that is equivalent.
 *
 * Salt and hash are stored base64 in separate columns so the parameters can be
 * changed later without a format migration.
 */

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveRound(
  input: Uint8Array<ArrayBufferLike>,
  salt: Uint8Array,
): Promise<Uint8Array<ArrayBufferLike>> {
  const key = await crypto.subtle.importKey('raw', input as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS_PER_ROUND,
    },
    key,
    PBKDF2_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Runs the full chain. Each round's output is the next round's input, so the
 * rounds are strictly sequential and an attacker cannot parallelise them.
 */
async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  // Annotated with ArrayBufferLike so the encoder's output and each round's
  // output share one type; the defaults differ between them.
  let material: Uint8Array<ArrayBufferLike> = encoder.encode(password);
  for (let round = 0; round < PBKDF2_ROUNDS; round += 1) {
    material = await deriveRound(material, salt);
  }
  return material;
}

export interface PasswordRecord {
  hash: string;
  salt: string;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await derive(password, salt);
  return { hash: toBase64(hash), salt: toBase64(salt) };
}

/**
 * Constant-time comparison. A length-dependent early return would leak how much
 * of the hash matched, so the whole buffer is always walked.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const derived = await derive(password, fromBase64(record.salt));
  return timingSafeEqual(derived, fromBase64(record.hash));
}

/**
 * The most-guessed passwords. A short embedded list, not a full corpus: it
 * blocks the handful of values that dominate real credential-stuffing lists
 * without shipping a megabyte of data to every isolate.
 */
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'qwertyui', 'iloveyou', 'admin123', 'welcome1', 'football',
  'baseball', 'sunshine', 'princess', 'letmein1', 'trustno1', 'dragon12',
  'monkey12', 'abc12345', '11111111', '00000000', 'zaq12wsx', 'qazwsxedc',
  'passw0rd', 'p@ssw0rd', 'buddy123', 'changeme',
]);

/**
 * Enforces the §4.3 policy. Throws a 400 with a message meant for display, so
 * routes don't each reimplement the rules.
 */
export function assertPasswordAllowed(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw badRequest('That password is too long');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw badRequest('That password is too common — pick something less guessable');
  }
}
