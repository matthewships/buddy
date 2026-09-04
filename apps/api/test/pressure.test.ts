import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { runPressure } from '../src/jobs/pressure.js';
import { localDayEnd } from '../src/lib/time.js';
import { latestStart } from '../src/services/pressure.js';
import { addMember, createTask, get, onboard, pair, patch, post, resetRateLimits, signUp, today } from './helpers.js';

beforeEach(resetRateLimits);

async function nudgeRows(where: string, ...binds: unknown[]) {
  const { results } = await env.DB.prepare(`SELECT kind, template, sent_at FROM nudges WHERE ${where}`)
    .bind(...binds)
    .all<{ kind: string; template: string | null; sent_at: string | null }>();
  return results;
}

describe('the latest start (PRODUCT.md §3.1)', () => {
  it('is local midnight minus the estimate, in the owner’s zone', () => {
    // Tokyo is UTC+9 with no DST: 10 March ends at midnight on the 11th JST,
    // which is 15:00 UTC on the 10th.
    expect(localDayEnd('Asia/Tokyo', '2026-03-10').toISOString()).toBe('2026-03-10T15:00:00.000Z');
    expect(latestStart({ dueDate: '2026-03-10', estimatedMinutes: 90, startBy: null }, 'Asia/Tokyo')).toBe(
      '2026-03-10T13:30:00.000Z',
    );
  });

  it('handles the night the clocks change', () => {
    // London leaves BST on 2026-10-25; that day ends at 00:00 GMT = 00:00 UTC.
    expect(localDayEnd('Europe/London', '2026-10-25').toISOString()).toBe('2026-10-26T00:00:00.000Z');
    // The day before ends at 00:00 BST = 23:00 UTC.
    expect(localDayEnd('Europe/London', '2026-10-24').toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });

  it('lets the owner bring it forward, never push it back', () => {
    const derived = latestStart({ dueDate: '2026-03-10', estimatedMinutes: 90, startBy: null }, 'UTC');
    expect(derived).toBe('2026-03-10T22:30:00.000Z');
    expect(latestStart({ dueDate: '2026-03-10', estimatedMinutes: 90, startBy: '19:00' }, 'UTC')).toBe(
      '2026-03-10T19:00:00.000Z',
    );
    expect(latestStart({ dueDate: '2026-03-10', estimatedMinutes: 90, startBy: '23:30' }, 'UTC')).toBe(derived);
  });

  it('is returned on the task list and refused when later than the ceiling', async () => {
    const { owner, groupId } = await pair('startby');
    const id = await createTask(owner, groupId, 'Late one', today(), 60);
    const list = (await (await get(`/api/tasks?groupId=${groupId}&scope=all`, owner.accessToken)).json()) as {
      tasks: { id: string; latestStartAt: string | null }[];
    };
    expect(list.tasks.find((t) => t.id === id)?.latestStartAt).toBe(`${today()}T23:00:00.000Z`);

    expect((await patch(`/api/tasks/${id}`, { startBy: '23:30' }, owner.accessToken)).status).toBe(400);
    expect((await patch(`/api/tasks/${id}`, { startBy: '20:00' }, owner.accessToken)).status).toBe(200);
    const after = (await (await get(`/api/tasks?groupId=${groupId}&scope=all`, owner.accessToken)).json()) as {
      tasks: { id: string; latestStartAt: string | null }[];
    };
    expect(after.tasks.find((t) => t.id === id)?.latestStartAt).toBe(`${today()}T20:00:00.000Z`);
  });
});

describe('the start nudge (PRODUCT.md §3.3)', () => {
  it('fires once, inside the lead window, for an unstarted task', async () => {
    const { owner, groupId } = await pair('startnudge');
    // Test users are UTC. A 60-minute task due today must start by 23:00 UTC;
    // pretend it is 22:45.
    const id = await createTask(owner, groupId, 'Nudge me', today(), 60);
    const at = new Date(`${today()}T22:45:00.000Z`);

    const first = await runPressure(db(env.DB), env, at);
    expect(first.startNudges).toBe(1);
    const second = await runPressure(db(env.DB), env, at);
    expect(second.startNudges).toBe(0);

    expect(await nudgeRows("task_id = ? AND kind = 'start'", id)).toHaveLength(1);
  });

  it('does not fire hours ahead, or for a task already on the clock', async () => {
    const { owner, groupId } = await pair('startnudge-early');
    const id = await createTask(owner, groupId, 'Too early', today(), 60);
    expect((await runPressure(db(env.DB), env, new Date(`${today()}T09:00:00.000Z`))).startNudges).toBe(0);

    await post(`/api/tasks/${id}/start`, {}, owner.accessToken);
    expect((await runPressure(db(env.DB), env, new Date(`${today()}T22:45:00.000Z`))).startNudges).toBe(0);
  });
});

describe('a groupmate’s nudge', () => {
  it('is templated, once per sender per task per day, and within the budget', async () => {
    const { owner, buddy, groupId } = await pair('buddy-nudge');
    const id = await createTask(owner, groupId, 'Not started', today(), 30);

    expect((await post(`/api/tasks/${id}/nudge`, { template: 'waiting' }, owner.accessToken)).status).toBe(400);
    expect((await post(`/api/tasks/${id}/nudge`, { template: 'shout' }, buddy.accessToken)).status).toBe(400);

    const sent = await post(`/api/tasks/${id}/nudge`, { template: 'waiting' }, buddy.accessToken);
    expect(sent.status).toBe(201);
    // The same person about the same task again today: refused.
    expect((await post(`/api/tasks/${id}/nudge`, { template: 'ok' }, buddy.accessToken)).status).toBe(409);

    const list = (await (await get(`/api/tasks/${id}/nudges`, owner.accessToken)).json()) as {
      nudges: { kind: string; template: string; fromDisplayName: string | null }[];
    };
    expect(list.nudges).toHaveLength(1);
    expect(list.nudges[0]).toMatchObject({ kind: 'buddy', template: 'waiting' });

    // Started: no longer nudgeable.
    await post(`/api/tasks/${id}/start`, {}, owner.accessToken);
    const third = await addMember(owner, groupId, 'buddy-nudge-c@example.com', 'buddynudgec');
    expect((await post(`/api/tasks/${id}/nudge`, { template: 'waiting' }, third.accessToken)).status).toBe(409);
  });

  it('stops at three a day for the recipient', async () => {
    const { owner, buddy, groupId } = await pair('nudge-budget');
    const a = await createTask(owner, groupId, 'A', today(), 30);
    const b = await createTask(owner, groupId, 'B', today(), 30);
    const c = await createTask(owner, groupId, 'C', today(), 30);
    const d = await createTask(owner, groupId, 'D', today(), 30);
    for (const id of [a, b, c]) {
      expect((await post(`/api/tasks/${id}/nudge`, { template: 'waiting' }, buddy.accessToken)).status).toBe(201);
    }
    expect((await post(`/api/tasks/${d}/nudge`, { template: 'waiting' }, buddy.accessToken)).status).toBe(409);
  });
});

describe('a requested check-in', () => {
  it('is asked by the owner, sent when the time comes, and answered once', async () => {
    const { owner, buddy, groupId } = await pair('checkin');
    const id = await createTask(owner, groupId, 'Check on me', today(), 60);
    const inTen = new Date(Date.now() + 10 * 60_000).toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    expect((await post(`/api/tasks/${id}/checkin`, { buddyUserId: owner.userId, at: inTen }, owner.accessToken)).status).toBe(400);
    expect((await post(`/api/tasks/${id}/checkin`, { buddyUserId: buddy.userId, at: yesterday }, owner.accessToken)).status).toBe(400);
    expect((await post(`/api/tasks/${id}/checkin`, { buddyUserId: buddy.userId, at: inTen }, buddy.accessToken)).status).toBe(403);

    const asked = await post(`/api/tasks/${id}/checkin`, { buddyUserId: buddy.userId, at: inTen }, owner.accessToken);
    expect(asked.status).toBe(201);
    const { id: checkinId } = (await asked.json()) as { id: string };

    // Not yet: the buddy cannot reply before it is sent, and the job does not send early.
    expect((await post(`/api/nudges/${checkinId}/reply`, { template: 'checking' }, buddy.accessToken)).status).toBe(409);
    expect((await runPressure(db(env.DB), env, new Date())).checkins).toBe(0);

    const later = new Date(Date.now() + 11 * 60_000);
    expect((await runPressure(db(env.DB), env, later)).checkins).toBe(1);
    expect((await runPressure(db(env.DB), env, later)).checkins).toBe(0);

    expect((await post(`/api/nudges/${checkinId}/reply`, { template: 'checking' }, owner.accessToken)).status).toBe(403);
    expect((await post(`/api/nudges/${checkinId}/reply`, { template: 'checking' }, buddy.accessToken)).status).toBe(201);
    expect((await post(`/api/nudges/${checkinId}/reply`, { template: 'still_at_it' }, buddy.accessToken)).status).toBe(409);

    const rows = await nudgeRows('task_id = ? ORDER BY created_at', id);
    expect(rows.map((r) => r.kind)).toEqual(['checkin', 'checkin_reply']);
  });
});

describe('late, absent, and reliability (PRODUCT.md §3.6)', () => {
  it('marks a committed member late, then absent, and scores the session', async () => {
    const { owner, buddy, groupId } = await pair('reliability');
    const at = new Date(Date.now() + 30 * 60_000).toISOString();
    const opened = await post(`/api/groups/${groupId}/sessions`, { plannedMinutes: 25, scheduledFor: at }, owner.accessToken);
    const { session } = (await opened.json()) as { session: { id: string } };
    await post(`/api/sessions/${session.id}/join`, {}, buddy.accessToken);
    await post(`/api/sessions/${session.id}/start`, {}, owner.accessToken);

    const startedAt = Date.now();
    const six = new Date(startedAt + 6 * 60_000);
    const twelve = new Date(startedAt + 12 * 60_000);

    expect((await runPressure(db(env.DB), env, six)).markedLate).toBe(1);
    // A late member can still be nudged from inside the session.
    expect((await post(`/api/sessions/${session.id}/nudge/${buddy.userId}`, { template: 'waiting' }, owner.accessToken)).status).toBe(201);
    expect((await runPressure(db(env.DB), env, twelve)).markedAbsent).toBe(1);

    await post(`/api/sessions/${session.id}/end`, {}, owner.accessToken);

    const { results } = await env.DB.prepare(
      'SELECT user_id, reliability_pct, reliability_sessions FROM user_stats WHERE user_id IN (?, ?)',
    )
      .bind(owner.userId, buddy.userId)
      .all<{ user_id: string; reliability_pct: number | null; reliability_sessions: number }>();
    const of = (id: string) => results.find((r) => r.user_id === id)!;
    expect(of(owner.userId)).toMatchObject({ reliability_pct: 100, reliability_sessions: 1 });
    expect(of(buddy.userId)).toMatchObject({ reliability_pct: 0, reliability_sessions: 1 });

    // The band is on the profile; the number only on your own.
    const me = (await (await get('/api/me', buddy.accessToken)).json()) as { handle: string };
    const seen = (await (await get(`/api/users/${me.handle}`, owner.accessToken)).json()) as {
      stats: { reliability: string; reliabilityPct: number | null };
    };
    expect(seen.stats.reliability).toBe('new');
    expect(seen.stats.reliabilityPct).toBeNull();
  });

  it('pauses instant requests for somebody rebuilding, and says why', async () => {
    const flaky = await signUp('flaky@example.com');
    await onboard(flaky, 'flaky');
    const other = await signUp('reliable-target@example.com');
    await onboard(other, 'reliabletarget');
    await patch('/api/me', { isOpenBuddy: true }, other.accessToken);

    await env.DB.prepare('UPDATE user_stats SET reliability_pct = 40, reliability_sessions = 6 WHERE user_id = ?')
      .bind(flaky.userId)
      .run();
    const res = await post('/api/buddy-requests', { toUserId: other.userId }, flaky.accessToken);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/show-up rate/);
  });
});
