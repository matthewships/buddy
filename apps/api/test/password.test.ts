import { describe, expect, it } from 'vitest';

import {
  PBKDF2_ITERATIONS_PER_ROUND,
  PBKDF2_MAX_ITERATIONS_PER_CALL,
  PBKDF2_ROUNDS,
  PBKDF2_TOTAL_ITERATIONS,
} from '@buddy/shared';

import { assertPasswordAllowed, hashPassword, verifyPassword } from '../src/services/password.js';

describe('PBKDF2 parameters', () => {
  /**
   * This is the test that was missing when 600,000 iterations shipped and 500'd
   * in production. Miniflare does not enforce the runtime's per-call ceiling, so
   * no functional test can catch it — the parameter itself has to be asserted.
   */
  it('never requests more iterations per call than the runtime allows', () => {
    expect(PBKDF2_ITERATIONS_PER_ROUND).toBeLessThanOrEqual(PBKDF2_MAX_ITERATIONS_PER_CALL);
  });

  it('still reaches the OWASP work factor across the chain', () => {
    expect(PBKDF2_TOTAL_ITERATIONS).toBe(PBKDF2_ITERATIONS_PER_ROUND * PBKDF2_ROUNDS);
    expect(PBKDF2_TOTAL_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });
});

describe('hashPassword', () => {
  it('verifies the correct password', async () => {
    const record = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', record)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const record = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('correct-horse-batteru', record)).resolves.toBe(false);
  });

  it('produces a different hash for the same password, via the salt', async () => {
    const a = await hashPassword('correct-horse-battery');
    const b = await hashPassword('correct-horse-battery');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // Both still verify, so the salt is genuinely per-record.
    await expect(verifyPassword('correct-horse-battery', a)).resolves.toBe(true);
    await expect(verifyPassword('correct-horse-battery', b)).resolves.toBe(true);
  });

  it('rejects a hash whose salt has been swapped', async () => {
    const a = await hashPassword('correct-horse-battery');
    const b = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', { hash: a.hash, salt: b.salt })).resolves.toBe(
      false,
    );
  });
});

describe('assertPasswordAllowed', () => {
  it('accepts a reasonable password', () => {
    expect(() => assertPasswordAllowed('correct-horse-battery')).not.toThrow();
  });

  it('rejects one that is too short', () => {
    expect(() => assertPasswordAllowed('short')).toThrow();
  });

  it('rejects a common password regardless of case', () => {
    expect(() => assertPasswordAllowed('password')).toThrow();
    expect(() => assertPasswordAllowed('PassWord')).toThrow();
  });
});
