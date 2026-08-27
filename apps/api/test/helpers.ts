import { SELF, env } from 'cloudflare:test';
import { expect, vi } from 'vitest';

/**
 * Shared helpers for the route tests.
 *
 * Verification codes are read back from the console, because the test
 * environment has no EMAIL binding and services/email.ts falls back to logging.
 * That keeps the tests exercising the real issue-and-consume path rather than
 * reaching into the codes table and bypassing the hashing.
 */

export const BASE = 'https://api.test';

export async function post(path: string, body: unknown, token?: string) {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function patch(path: string, body: unknown, token?: string) {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function get(path: string, token?: string) {
  return SELF.fetch(`${BASE}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** Captures codes written by the email fallback while `fn` runs. */
export async function captureCodes<T>(fn: () => Promise<T>): Promise<{
  result: T;
  codes: string[];
}> {
  const codes: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    const line = args.join(' ');
    const match = /\[email:log\].*code=(\d{6})/.exec(line);
    if (match?.[1]) codes.push(match[1]);
  });
  try {
    const result = await fn();
    return { result, codes };
  } finally {
    spy.mockRestore();
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

/** Registers, verifies and returns a usable session. */
export async function signUp(
  email: string,
  password = 'correct-horse-battery',
  displayName = 'Test User',
): Promise<Session> {
  const { codes } = await captureCodes(async () => {
    const res = await post('/api/auth/register', { email, password, displayName });
    expect(res.status).toBe(201);
  });

  const code = codes.at(-1);
  expect(code).toMatch(/^\d{6}$/);

  const verified = await post('/api/auth/verify-email', { email, code });
  expect(verified.status).toBe(200);
  const body = (await verified.json()) as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    email,
  };
}

/** Completes onboarding so the account can use the rest of the API. */
export async function onboard(
  session: Session,
  handle: string,
  extra: Record<string, unknown> = {},
) {
  const res = await patch(
    '/api/me',
    { handle, goalKey: 'thesis', occupationKey: 'student_grad', ...extra },
    session.accessToken,
  );
  expect(res.status).toBe(200);
  return res.json();
}

/** Clears rate-limit counters so one test's attempts don't fail the next. */
export async function resetRateLimits() {
  const { keys } = await env.CACHE.list({ prefix: 'rl:' });
  await Promise.all(keys.map((k) => env.CACHE.delete(k.name)));
}
