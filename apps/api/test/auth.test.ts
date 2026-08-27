import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  captureCodes,
  get,
  onboard,
  patch,
  post,
  resetRateLimits,
  signUp,
} from './helpers.js';

beforeEach(resetRateLimits);

describe('registration and verification', () => {
  it('registers, emails a code, and verifies into a session', async () => {
    const session = await signUp('alice@example.com');
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
  });

  it('rejects a weak password before creating anything', async () => {
    const res = await post('/api/auth/register', {
      email: 'weak@example.com',
      password: 'password',
      displayName: 'Weak',
    });
    expect(res.status).toBe(400);
    const { results } = await env.DB.prepare('SELECT count(*) AS n FROM users WHERE email = ?')
      .bind('weak@example.com')
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(0);
  });

  it('does not reveal that an email is already registered', async () => {
    await signUp('dup@example.com');
    const again = await post('/api/auth/register', {
      email: 'dup@example.com',
      password: 'another-good-password',
      displayName: 'Impostor',
    });
    // Same status and body as a fresh registration.
    expect(again.status).toBe(201);
    await expect(again.json()).resolves.toEqual({ ok: true, emailSent: true });
  });

  it('does not overwrite the original password on a duplicate registration', async () => {
    await signUp('keep@example.com', 'the-original-password');
    await post('/api/auth/register', {
      email: 'keep@example.com',
      password: 'attacker-chosen-password',
      displayName: 'Impostor',
    });

    await resetRateLimits();
    const attacker = await post('/api/auth/login', {
      email: 'keep@example.com',
      password: 'attacker-chosen-password',
    });
    expect(attacker.status).toBe(401);

    await resetRateLimits();
    const owner = await post('/api/auth/login', {
      email: 'keep@example.com',
      password: 'the-original-password',
    });
    expect(owner.status).toBe(200);
  });

  it('rejects an incorrect code and consumes an attempt', async () => {
    const { codes } = await captureCodes(async () => {
      await post('/api/auth/register', {
        email: 'wrongcode@example.com',
        password: 'correct-horse-battery',
        displayName: 'W',
      });
    });
    const real = codes.at(-1)!;
    const wrong = real === '000000' ? '111111' : '000000';

    const bad = await post('/api/auth/verify-email', {
      email: 'wrongcode@example.com',
      code: wrong,
    });
    expect(bad.status).toBe(400);

    // The real code still works — a wrong guess must not invalidate it.
    const good = await post('/api/auth/verify-email', {
      email: 'wrongcode@example.com',
      code: real,
    });
    expect(good.status).toBe(200);
  });

  it('cannot replay a code that was already used', async () => {
    const { codes } = await captureCodes(async () => {
      await post('/api/auth/register', {
        email: 'replay@example.com',
        password: 'correct-horse-battery',
        displayName: 'R',
      });
    });
    const code = codes.at(-1)!;
    expect((await post('/api/auth/verify-email', { email: 'replay@example.com', code })).status).toBe(200);
    expect((await post('/api/auth/verify-email', { email: 'replay@example.com', code })).status).toBe(400);
  });

  it('invalidates the previous code when a new one is requested', async () => {
    const { codes: first } = await captureCodes(async () => {
      await post('/api/auth/register', {
        email: 'resend@example.com',
        password: 'correct-horse-battery',
        displayName: 'R',
      });
    });
    const { codes: second } = await captureCodes(async () => {
      await post('/api/auth/resend-code', { email: 'resend@example.com', purpose: 'verify' });
    });

    expect(first.at(-1)).not.toBe(second.at(-1));
    const stale = await post('/api/auth/verify-email', {
      email: 'resend@example.com',
      code: first.at(-1),
    });
    expect(stale.status).toBe(400);
    const fresh = await post('/api/auth/verify-email', {
      email: 'resend@example.com',
      code: second.at(-1),
    });
    expect(fresh.status).toBe(200);
  });
});

describe('login', () => {
  it('returns the same message for a wrong password and an unknown email', async () => {
    await signUp('real@example.com', 'correct-horse-battery');
    await resetRateLimits();

    const wrongPassword = await post('/api/auth/login', {
      email: 'real@example.com',
      password: 'not-the-password',
    });
    await resetRateLimits();
    const unknownEmail = await post('/api/auth/login', {
      email: 'ghost@example.com',
      password: 'not-the-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    await expect(wrongPassword.json()).resolves.toEqual(await unknownEmail.json());
  });

  it('tells an unverified account to verify, without issuing tokens', async () => {
    await post('/api/auth/register', {
      email: 'unverified@example.com',
      password: 'correct-horse-battery',
      displayName: 'U',
    });
    await resetRateLimits();

    const res = await post('/api/auth/login', {
      email: 'unverified@example.com',
      password: 'correct-horse-battery',
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ verificationRequired: true });
    expect(body).not.toHaveProperty('accessToken');
  });

  it('rate limits repeated attempts on one email', async () => {
    await signUp('brute@example.com');
    await resetRateLimits();

    let sawLimit = false;
    for (let i = 0; i < 14; i += 1) {
      const res = await post('/api/auth/login', {
        email: 'brute@example.com',
        password: `guess-${i}`,
      });
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });
});

describe('refresh token rotation', () => {
  it('rotates the pair and invalidates the old refresh token', async () => {
    const session = await signUp('rotate@example.com');

    const first = await post('/api/auth/refresh', { refreshToken: session.refreshToken });
    expect(first.status).toBe(200);
    const rotated = (await first.json()) as { refreshToken: string };
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    const replay = await post('/api/auth/refresh', { refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const session = await signUp('family@example.com');

    const res = await post('/api/auth/refresh', { refreshToken: session.refreshToken });
    const current = (await res.json()) as { refreshToken: string };

    // Replaying the original signals theft, so the token issued from it dies too.
    await post('/api/auth/refresh', { refreshToken: session.refreshToken });
    const afterCompromise = await post('/api/auth/refresh', {
      refreshToken: current.refreshToken,
    });
    expect(afterCompromise.status).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await post('/api/auth/refresh', { refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });
});

describe('password reset', () => {
  it('resets with an emailed code and signs existing sessions out', async () => {
    const session = await signUp('reset@example.com', 'the-old-password');

    const { codes } = await captureCodes(async () => {
      const res = await post('/api/auth/forgot', { email: 'reset@example.com' });
      expect(res.status).toBe(200);
    });

    const res = await post('/api/auth/reset', {
      email: 'reset@example.com',
      code: codes.at(-1),
      newPassword: 'a-brand-new-password',
    });
    expect(res.status).toBe(200);

    // Old refresh token is dead.
    expect((await post('/api/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);

    await resetRateLimits();
    expect(
      (await post('/api/auth/login', { email: 'reset@example.com', password: 'the-old-password' }))
        .status,
    ).toBe(401);
    await resetRateLimits();
    expect(
      (
        await post('/api/auth/login', {
          email: 'reset@example.com',
          password: 'a-brand-new-password',
        })
      ).status,
    ).toBe(200);
  });

  it('returns 200 for an unknown address, so it cannot enumerate accounts', async () => {
    const res = await post('/api/auth/forgot', { email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('will not accept a verify code in place of a reset code', async () => {
    const { codes } = await captureCodes(async () => {
      await post('/api/auth/register', {
        email: 'crosspurpose@example.com',
        password: 'correct-horse-battery',
        displayName: 'C',
      });
    });

    const res = await post('/api/auth/reset', {
      email: 'crosspurpose@example.com',
      code: codes.at(-1),
      newPassword: 'a-brand-new-password',
    });
    expect(res.status).toBe(400);
  });
});

describe('authenticated access', () => {
  it('rejects a missing or malformed token', async () => {
    expect((await get('/api/me')).status).toBe(401);
    expect((await get('/api/me', 'garbage')).status).toBe(401);
  });

  it('returns the profile and reports onboarding state', async () => {
    const session = await signUp('me@example.com');

    const before = await get('/api/me', session.accessToken);
    expect(before.status).toBe(200);
    await expect(before.json()).resolves.toMatchObject({
      email: 'me@example.com',
      emailVerified: true,
      onboarded: false,
    });

    await onboard(session, 'mehandle');

    const after = await get('/api/me', session.accessToken);
    await expect(after.json()).resolves.toMatchObject({
      handle: 'mehandle',
      goalKey: 'thesis',
      onboarded: true,
    });
  });

  it('changes the password and revokes other sessions', async () => {
    const session = await signUp('changepw@example.com', 'the-old-password');

    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'the-old-password', newPassword: 'a-brand-new-password' },
      session.accessToken,
    );
    expect(res.status).toBe(200);
    expect((await post('/api/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
  });

  it('refuses a password change with the wrong current password', async () => {
    const session = await signUp('wrongcurrent@example.com', 'the-old-password');
    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'not-it', newPassword: 'a-brand-new-password' },
      session.accessToken,
    );
    expect(res.status).toBe(400);
  });

  it('logs out by revoking the refresh token', async () => {
    const session = await signUp('logout@example.com');
    expect((await post('/api/auth/logout', { refreshToken: session.refreshToken })).status).toBe(200);
    expect((await post('/api/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
  });
});

describe('profile and handles', () => {
  it('rejects a handle already taken by someone else', async () => {
    const first = await signUp('h1@example.com');
    await onboard(first, 'takenhandle');

    const second = await signUp('h2@example.com');
    const res = await patch('/api/me', { handle: 'takenhandle' }, second.accessToken);
    expect(res.status).toBe(409);
  });

  it('reports handle availability', async () => {
    const session = await signUp('avail@example.com');
    await onboard(session, 'availhandle');

    const mine = await get('/api/me/handle-available?handle=availhandle', session.accessToken);
    // The user's own handle is available to them.
    await expect(mine.json()).resolves.toMatchObject({ available: true });

    const other = await signUp('avail2@example.com');
    const theirs = await get('/api/me/handle-available?handle=availhandle', other.accessToken);
    await expect(theirs.json()).resolves.toMatchObject({ available: false });
  });

  it('requires free text for a custom goal', async () => {
    const session = await signUp('customgoal@example.com');
    const bad = await patch('/api/me', { goalKey: 'custom' }, session.accessToken);
    expect(bad.status).toBe(400);

    const good = await patch(
      '/api/me',
      { handle: 'customgoal', goalKey: 'custom', goalText: 'Ship Buddy v1' },
      session.accessToken,
    );
    expect(good.status).toBe(200);
    await expect(good.json()).resolves.toMatchObject({ goalText: 'Ship Buddy v1' });
  });

  it('stores the buddy profile and exposes it only when open to requests', async () => {
    const session = await signUp('buddyprofile@example.com');
    await onboard(session, 'buddyprof', {
      isOpenBuddy: false,
      buddyProfile: { headline: 'Thesis by December', about: 'PhD, writing up.' },
    });

    const viewer = await signUp('viewer@example.com');
    const hidden = await get('/api/users/buddyprof', viewer.accessToken);
    await expect(hidden.json()).resolves.toMatchObject({ buddyProfile: null });

    await patch('/api/me', { isOpenBuddy: true }, session.accessToken);
    const shown = await get('/api/users/buddyprof', viewer.accessToken);
    await expect(shown.json()).resolves.toMatchObject({
      buddyProfile: { headline: 'Thesis by December' },
    });
  });

  it('404s for an unknown handle', async () => {
    const session = await signUp('lookup@example.com');
    expect((await get('/api/users/nobodyhere', session.accessToken)).status).toBe(404);
  });
});
