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

/**
 * Registers, verifies and returns a usable session.
 *
 * Clears the rate-limit counters first: registration is capped at 5/hour per IP
 * and every test shares one IP, so a test that needs several accounts would
 * otherwise trip a limiter it isn't testing. The limits themselves have their
 * own dedicated tests.
 */
export async function signUp(
  email: string,
  password = 'correct-horse-battery',
  displayName = 'Test User',
): Promise<Session> {
  await resetRateLimits();
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

export async function del(path: string, token?: string, body?: unknown) {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * Two onboarded users sharing a group, which is the minimum setup for the
 * review loop: a task owner and someone allowed to review it.
 */
export async function pair(prefix: string): Promise<{
  owner: Session;
  buddy: Session;
  groupId: string;
  ownerHandle: string;
  buddyHandle: string;
}> {
  // Handles allow only [a-z0-9_], so a prefix like "bonus-once" has to be
  // sanitized before it can become one.
  const slug = prefix.replace(/[^a-z0-9]/g, '');
  const owner = await signUp(`${prefix}-owner@example.com`);
  await onboard(owner, `${slug}owner`);
  const buddy = await signUp(`${prefix}-buddy@example.com`);
  await onboard(buddy, `${slug}buddy`);

  const created = await post('/api/groups', { name: `${prefix} group` }, owner.accessToken);
  const { group } = (await created.json()) as { group: { id: string } };

  await post(`/api/groups/${group.id}/invites`, { handle: `${slug}buddy` }, owner.accessToken);
  const { invites } = (await (await get('/api/invites', buddy.accessToken)).json()) as {
    invites: { id: string }[];
  };
  await post(`/api/invites/${invites[0]!.id}/accept`, {}, buddy.accessToken);

  return {
    owner,
    buddy,
    groupId: group.id,
    ownerHandle: `${slug}owner`,
    buddyHandle: `${slug}buddy`,
  };
}

/** Today in UTC, which is the timezone test users default to. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function createTask(
  session: Session,
  groupId: string,
  title = 'Read 20 pages',
  dueDate = today(),
): Promise<string> {
  const res = await post('/api/tasks', { groupId, title, dueDate }, session.accessToken);
  expect(res.status).toBe(201);
  const { task } = (await res.json()) as { task: { id: string } };
  return task.id;
}

/** Reads a user's denormalised stats straight from D1. */
export async function statsFor(userId: string) {
  const { results } = await env.DB.prepare('SELECT * FROM user_stats WHERE user_id = ?')
    .bind(userId)
    .all<{
      total_credits: number;
      weekly_credits: number;
      current_streak: number;
      best_streak: number;
      tasks_approved: number;
      reviews_given: number;
      last_approved_date: string | null;
    }>();
  return results[0]!;
}
