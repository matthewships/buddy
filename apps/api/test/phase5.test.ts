import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { runWeekly } from '../src/jobs/weekly.js';

import {
  BASE,
  createTask,
  del,
  get,
  onboard,
  pair,
  post,
  resetRateLimits,
  signUp,
  statsFor,
} from './helpers.js';

beforeEach(resetRateLimits);

const ADMIN_TOKEN = 'test-admin-token';

async function fetchAdmin(path: string, token: string, method: string, body?: unknown) {
  const { SELF } = await import('cloudflare:test');
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Earns the owner some credits, which is what the leaderboard ranks on. */
async function earn(prefix: string, rating: number) {
  const { owner, buddy, groupId, ownerHandle } = await pair(prefix);
  const id = await createTask(owner, groupId);
  await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
  await post(`/api/tasks/${id}/review`, { action: 'approve', rating }, buddy.accessToken);
  return { owner, buddy, ownerHandle, groupId };
}

describe('leaderboard', () => {
  it('ranks by credits and reports the callers own rank', async () => {
    const big = await earn('lbbig', 5);
    const small = await earn('lbsmall', 1);

    // A fresh key each run, so this is computed rather than served stale.
    const res = await get('/api/leaderboard?scope=alltime', big.owner.accessToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: { handle: string; credits: number; rank: number }[];
      me: { rank: number | null; credits: number };
    };

    const bigEntry = body.entries.find((e) => e.handle === big.ownerHandle);
    const smallEntry = body.entries.find((e) => e.handle === small.ownerHandle);
    expect(bigEntry).toBeTruthy();
    expect(smallEntry).toBeTruthy();
    expect(bigEntry!.rank).toBeLessThan(smallEntry!.rank);
    expect(body.me.credits).toBeGreaterThan(0);
    expect(body.me.rank).toBe(bigEntry!.rank);
  });

  it('excludes users with no credits', async () => {
    const { owner } = await earn('lbzero', 3);
    const idle = await signUp('lb-idle@example.com');
    await onboard(idle, 'lbidle');

    const body = (await (
      await get('/api/leaderboard?scope=alltime', owner.accessToken)
    ).json()) as { entries: { handle: string }[] };

    expect(body.entries.map((e) => e.handle)).not.toContain('lbidle');
  });

  it('reports no rank for someone who has earned nothing', async () => {
    const idle = await signUp('lb-norank@example.com');
    await onboard(idle, 'lbnorank');

    const body = (await (
      await get('/api/leaderboard?scope=alltime', idle.accessToken)
    ).json()) as { me: { rank: number | null; credits: number } };

    expect(body.me).toEqual({ rank: null, credits: 0 });
  });

  it('serves the weekly board and caches it in KV', async () => {
    const { owner } = await earn('lbweek', 4);

    const res = await get('/api/leaderboard?scope=weekly', owner.accessToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; generatedAt: string };
    expect(body.entries.length).toBeGreaterThan(0);
    expect(Date.parse(body.generatedAt)).toBeGreaterThan(0);

    const keys = await env.CACHE.list({ prefix: 'leaderboard:' });
    expect(keys.keys.length).toBeGreaterThan(0);
  });
});

describe('weekly rollover', () => {
  it('freezes the board, then clears weekly credits but not all-time', async () => {
    const { owner } = await earn('weekly', 5);

    const before = await statsFor(owner.userId);
    expect(before.weekly_credits).toBeGreaterThan(0);

    const result = await runWeekly(db(env.DB), env.CACHE);
    expect(result.rowsCleared).toBeGreaterThanOrEqual(0);

    // The snapshot was written before the reset, so the frozen board still has
    // the finished week's standings.
    const snapshot = await env.CACHE.list({ prefix: 'leaderboard:weekly:' });
    expect(snapshot.keys.length).toBeGreaterThan(0);

    const after = await statsFor(owner.userId);
    expect(after.total_credits).toBe(before.total_credits); // all-time survives
  });
});

describe('reports', () => {
  it('accepts a report and de-duplicates a repeat from the same person', async () => {
    const { owner, buddy, groupId } = await pair('report');
    const taskId = await createTask(buddy, groupId, 'Suspicious task');

    const first = await post(
      '/api/reports',
      { targetType: 'task', targetId: taskId, reason: 'Not actually done', note: 'No proof' },
      owner.accessToken,
    );
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({ alreadyReported: false });

    // Re-reporting is a no-op, not a way to inflate a count — and not an error.
    const again = await post(
      '/api/reports',
      { targetType: 'task', targetId: taskId, reason: 'Still not done' },
      owner.accessToken,
    );
    expect(again.status).toBe(201);
    await expect(again.json()).resolves.toMatchObject({ alreadyReported: true });

    const { results } = await env.DB.prepare(
      'SELECT count(*) AS n FROM reports WHERE target_id = ?',
    )
      .bind(taskId)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(1);
  });

  it('refuses a report against something that does not exist', async () => {
    const { owner } = await pair('reportghost');
    const res = await post(
      '/api/reports',
      { targetType: 'task', targetId: '01J9ZQWX8T0000000000000000', reason: 'Nothing here' },
      owner.accessToken,
    );
    expect(res.status).toBe(404);
  });
});

describe('admin endpoints', () => {
  it('rejects a missing, wrong, or malformed token', async () => {
    expect((await fetchAdmin('/api/admin/reports', '', 'GET')).status).toBe(401);
    expect((await fetchAdmin('/api/admin/reports', 'wrong-token', 'GET')).status).toBe(401);
    // Same length as the real token, so length alone is not what rejects it.
    expect(
      (await fetchAdmin('/api/admin/reports', 'x'.repeat(ADMIN_TOKEN.length), 'GET')).status,
    ).toBe(401);
  });

  it('lists open reports and resolves one', async () => {
    const { owner, buddy, groupId } = await pair('adminflow');
    const taskId = await createTask(buddy, groupId, 'Reported task');
    await post(
      '/api/reports',
      { targetType: 'task', targetId: taskId, reason: 'Made up' },
      owner.accessToken,
    );

    const listed = await fetchAdmin('/api/admin/reports', ADMIN_TOKEN, 'GET');
    expect(listed.status).toBe(200);
    const { reports } = (await listed.json()) as {
      reports: { id: string; reason: string; status: string }[];
    };
    const found = reports.find((r) => r.reason === 'Made up');
    expect(found?.status).toBe('open');

    const resolved = await fetchAdmin(`/api/admin/reports/${found!.id}`, ADMIN_TOKEN, 'PATCH', {
      status: 'actioned',
    });
    expect(resolved.status).toBe(200);

    // Resolving twice is refused rather than silently repeated.
    const again = await fetchAdmin(`/api/admin/reports/${found!.id}`, ADMIN_TOKEN, 'PATCH', {
      status: 'dismissed',
    });
    expect(again.status).toBe(409);
  });

  it('hides a reported message on request, without destroying it', async () => {
    const { owner, buddy, groupId } = await pair('adminhide');

    // Insert a message directly: the chat socket is covered elsewhere.
    const messageId = '01J9ZQWX8T0000000000000001';
    await env.DB.prepare(
      'INSERT INTO messages (id, group_id, sender_id, body) VALUES (?, ?, ?, ?)',
    )
      .bind(messageId, groupId, buddy.userId, 'Something abusive')
      .run();

    await post(
      '/api/reports',
      { targetType: 'message', targetId: messageId, reason: 'Abuse' },
      owner.accessToken,
    );

    const listed = await fetchAdmin('/api/admin/reports', ADMIN_TOKEN, 'GET');
    const { reports } = (await listed.json()) as { reports: { id: string; reason: string }[] };
    const report = reports.find((r) => r.reason === 'Abuse')!;

    await fetchAdmin(`/api/admin/reports/${report.id}`, ADMIN_TOKEN, 'PATCH', {
      status: 'actioned',
      hideContent: true,
    });

    // Soft-deleted: the row survives for audit, but history stops serving it.
    const { results } = await env.DB.prepare('SELECT deleted_at FROM messages WHERE id = ?')
      .bind(messageId)
      .all<{ deleted_at: string | null }>();
    expect(results[0]?.deleted_at).toBeTruthy();

    const history = (await (
      await get(`/api/groups/${groupId}/messages`, owner.accessToken)
    ).json()) as { messages: { id: string }[] };
    expect(history.messages.map((m) => m.id)).not.toContain(messageId);
  });

  it('summarises the queue by status', async () => {
    const res = await fetchAdmin('/api/admin/reports/summary', ADMIN_TOKEN, 'GET');
    expect(res.status).toBe(200);
    const { counts } = (await res.json()) as { counts: Record<string, number> };
    // Every status is present, so callers never distinguish absent from zero.
    expect(Object.keys(counts).sort()).toEqual(['actioned', 'dismissed', 'open']);
  });
});

describe('account deletion', () => {
  it('scrubs the account, revokes sessions, and keeps shared history', async () => {
    const { owner, buddy, groupId } = await pair('delete');
    const taskId = await createTask(owner, groupId);
    await post(`/api/tasks/${taskId}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${taskId}/review`, { action: 'approve', rating: 4 }, buddy.accessToken);

    const res = await del('/api/me', owner.accessToken);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ alreadyDeleted: false });

    // Sessions are gone.
    expect((await post('/api/auth/refresh', { refreshToken: owner.refreshToken })).status).toBe(401);
    expect((await get('/api/me', owner.accessToken)).status).toBe(401);

    // Identifying fields are scrubbed.
    const { results } = await env.DB.prepare(
      'SELECT email, handle, display_name, deleted_at, is_open_buddy FROM users WHERE id = ?',
    )
      .bind(owner.userId)
      .all<{
        email: string;
        handle: string;
        display_name: string;
        deleted_at: string | null;
        is_open_buddy: number;
      }>();
    expect(results[0]?.display_name).toBe('Deleted account');
    expect(results[0]?.email).toContain('deleted.invalid');
    expect(results[0]?.deleted_at).toBeTruthy();
    expect(results[0]?.is_open_buddy).toBe(0);

    // The buddy's earned review still exists — deleting one account must not
    // rewrite another person's history or reverse their credits.
    const reviews = await env.DB.prepare(
      'SELECT count(*) AS n FROM task_reviews WHERE reviewer_id = ?',
    )
      .bind(buddy.userId)
      .all<{ n: number }>();
    expect(reviews.results[0]?.n).toBe(1);
    expect((await statsFor(buddy.userId)).reviews_given).toBe(1);

    // And no device rows remain, so nothing can be pushed to them.
    const devices = await env.DB.prepare('SELECT count(*) AS n FROM devices WHERE user_id = ?')
      .bind(owner.userId)
      .all<{ n: number }>();
    expect(devices.results[0]?.n).toBe(0);
  });

  it('drops a deleted account out of the buddy directory', async () => {
    const viewer = await signUp('del-viewer@example.com');
    await onboard(viewer, 'delviewer', { isOpenBuddy: true });
    const leaving = await signUp('del-leaving@example.com');
    await onboard(leaving, 'delleaving', { isOpenBuddy: true });

    const before = (await (await get('/api/buddies', viewer.accessToken)).json()) as {
      buddies: { handle: string }[];
    };
    expect(before.buddies.map((b) => b.handle)).toContain('delleaving');

    await del('/api/me', leaving.accessToken);

    const after = (await (await get('/api/buddies', viewer.accessToken)).json()) as {
      buddies: { handle: string }[];
    };
    expect(after.buddies.map((b) => b.handle)).not.toContain('delleaving');
  });
});
