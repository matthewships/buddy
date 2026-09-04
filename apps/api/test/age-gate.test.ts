import { beforeEach, describe, expect, it } from 'vitest';

import { MIN_AGE_YEARS } from '@buddy/shared';

import { patch, resetRateLimits, signUp } from './helpers.js';

beforeEach(resetRateLimits);

/** A birth date exactly `years` before today, as `YYYY-MM-DD`. */
function bornYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The floor is enforced by Zod, which means it is enforced by the API rather
 * than by the screen that asks — the point being that skipping the client is
 * not a way past it.
 */
describe('the age gate', () => {
  it('accepts somebody exactly at the floor', async () => {
    const me = await signUp('age-ok@example.com');
    const res = await patch(
      '/api/me',
      { handle: 'ageok', dateOfBirth: bornYearsAgo(MIN_AGE_YEARS) },
      me.accessToken,
    );
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>).dateOfBirth).toBe(
      bornYearsAgo(MIN_AGE_YEARS),
    );
  });

  it('refuses somebody a year under it', async () => {
    const me = await signUp('age-young@example.com');
    const res = await patch(
      '/api/me',
      { handle: 'ageyoung', dateOfBirth: bornYearsAgo(MIN_AGE_YEARS - 1) },
      me.accessToken,
    );
    expect(res.status).toBe(400);
  });

  it('refuses a malformed or future date rather than failing open', async () => {
    const me = await signUp('age-junk@example.com');
    for (const dateOfBirth of ['', 'yesterday', '2010-02-30', '2035-01-01', '01/02/2010']) {
      const res = await patch('/api/me', { dateOfBirth }, me.accessToken);
      expect(res.status).toBe(400);
    }
  });

  /**
   * Write-once. An age gate somebody can clear once and then edit away is not
   * a gate, and the profile editor patches the same route.
   */
  it('does not let an answer be replaced', async () => {
    const me = await signUp('age-fixed@example.com');
    const first = bornYearsAgo(20);
    expect((await patch('/api/me', { handle: 'agefixed', dateOfBirth: first }, me.accessToken)).status).toBe(200);

    const second = await patch('/api/me', { dateOfBirth: bornYearsAgo(40) }, me.accessToken);
    // Accepted as a request, ignored as a change.
    expect(second.status).toBe(200);
    expect((await second.json() as Record<string, unknown>).dateOfBirth).toBe(first);
  });

  it('leaves an account that was never asked alone', async () => {
    const me = await signUp('age-legacy@example.com');
    const res = await patch('/api/me', { handle: 'agelegacy', city: 'Leeds' }, me.accessToken);
    expect(res.status).toBe(200);
    expect((await res.json() as Record<string, unknown>).dateOfBirth).toBeNull();
  });

  it('never puts a date of birth on somebody else’s profile', async () => {
    const me = await signUp('age-priv-a@example.com');
    await patch('/api/me', { handle: 'agepriva', dateOfBirth: bornYearsAgo(22) }, me.accessToken);

    const viewer = await signUp('age-priv-b@example.com');
    await patch('/api/me', { handle: 'ageprivb' }, viewer.accessToken);

    const res = await (await import('./helpers.js')).get('/api/users/agepriva', viewer.accessToken);
    if (res.status === 200) {
      expect(await res.json()).not.toHaveProperty('dateOfBirth');
    }
  });
});
