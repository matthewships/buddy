import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { runRollover } from '../src/jobs/rollover.js';
import { db } from '../src/db/client.js';
import { createTask, del, get, pair, post, put, resetRateLimits, statsFor, today } from './helpers.js';

beforeEach(resetRateLimits);

/** Winds a session's start back so ending it books real minutes. */
async function backdateSession(sessionId: string, minutesAgo: number) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  await env.DB.prepare('UPDATE sessions SET started_at = ? WHERE id = ?').bind(at, sessionId).run();
  await env.DB.prepare('UPDATE session_participants SET joined_at = ? WHERE session_id = ?')
    .bind(at, sessionId)
    .run();
  await env.DB.prepare('UPDATE tasks SET started_at = ? WHERE session_id = ? AND started_at IS NOT NULL')
    .bind(at, sessionId)
    .run();
}

async function taskRow(id: string) {
  const { results } = await env.DB.prepare(
    'SELECT session_id, actual_minutes, started_at FROM tasks WHERE id = ?',
  )
    .bind(id)
    .all<{ session_id: string | null; actual_minutes: number; started_at: string | null }>();
  return results[0]!;
}

async function sessionRow(id: string) {
  const { results } = await env.DB.prepare('SELECT kind, state FROM sessions WHERE id = ?')
    .bind(id)
    .all<{ kind: string; state: string }>();
  return results[0]!;
}

describe('the solo session around a task (PRODUCT.md §3.1)', () => {
  it('is created by Start and ended by Done, booking the minutes at the unverified rate', async () => {
    const { owner, groupId } = await pair('solo-session');
    const taskId = await createTask(owner, groupId, 'Chapter 4', today(), 60);

    expect((await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken)).status).toBe(200);
    const started = await taskRow(taskId);
    expect(started.session_id).not.toBeNull();
    expect(await sessionRow(started.session_id!)).toEqual({ kind: 'solo', state: 'live' });

    await backdateSession(started.session_id!, 40);
    expect((await post(`/api/tasks/${taskId}/done`, {}, owner.accessToken)).status).toBe(200);

    const done = await taskRow(taskId);
    expect(done.started_at).toBeNull();
    expect(done.actual_minutes).toBe(40);
    expect((await sessionRow(started.session_id!)).state).toBe('ended');

    const stats = await statsFor(owner.userId);
    // Forty unverified minutes at half a credit each.
    expect(stats.total_credits).toBe(20);
    // Forty minutes is a session day: the streak starts.
    expect(stats.current_streak).toBe(1);
  });

  it('caps minutes at one and a half times the plan', async () => {
    const { owner, groupId } = await pair('solo-cap');
    const taskId = await createTask(owner, groupId, 'Long one', today(), 20);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    const { session_id } = await taskRow(taskId);
    await backdateSession(session_id!, 300);
    await post(`/api/tasks/${taskId}/done`, {}, owner.accessToken);
    expect((await taskRow(taskId)).actual_minutes).toBe(30);
  });

  it('no longer charges for abandoning, and still books the minutes', async () => {
    const { owner, groupId } = await pair('abandon-free');
    const taskId = await createTask(owner, groupId, 'Drop me', today(), 60);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    const { session_id } = await taskRow(taskId);
    await backdateSession(session_id!, 10);

    const res = await post(`/api/tasks/${taskId}/abandon`, {}, owner.accessToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credits: number; task: { startedAt: string | null } };
    expect(body.credits).toBe(0);
    expect(body.task.startedAt).toBeNull();
    expect((await taskRow(taskId)).actual_minutes).toBe(10);
    expect((await statsFor(owner.userId)).total_credits).toBe(5);
    // Ten minutes is not a session day.
    expect((await statsFor(owner.userId)).current_streak).toBe(0);
  });

  it('pays the verified half on approval, not the rating', async () => {
    const { owner, buddy, groupId } = await pair('verified-topup');
    const taskId = await createTask(owner, groupId, 'Verified', today(), 60);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    const { session_id } = await taskRow(taskId);
    await backdateSession(session_id!, 50);
    await post(`/api/tasks/${taskId}/done`, { proofText: 'did it' }, owner.accessToken);
    expect((await statsFor(owner.userId)).total_credits).toBe(25);

    const review = await post(
      `/api/tasks/${taskId}/review`,
      { action: 'approve', rating: 1 },
      buddy.accessToken,
    );
    expect(review.status).toBe(200);
    const { award } = (await review.json()) as { award: { credits: number } };
    // Fifty minutes: 25 paid at the clock, 25 now. A one-star rating changes nothing.
    expect(award.credits).toBe(25);
    // Plus the day's bonus, since this was the day's only task and it is approved.
    expect((await statsFor(owner.userId)).total_credits).toBe(70);
  });
});

describe('group sessions', () => {
  it('is opened by a host, joined with a task, and pays everyone who stayed', async () => {
    const { owner, buddy, groupId } = await pair('group-session');
    const buddyTask = await createTask(buddy, groupId, 'Reading', today(), 50);

    const opened = await post(`/api/groups/${groupId}/sessions`, { plannedMinutes: 50 }, owner.accessToken);
    expect(opened.status).toBe(201);
    const { session } = (await opened.json()) as { session: { id: string; state: string } };
    expect(session.state).toBe('live');

    // A second one cannot start while this runs.
    expect((await post(`/api/groups/${groupId}/sessions`, { plannedMinutes: 25 }, buddy.accessToken)).status).toBe(409);

    const joined = await post(`/api/sessions/${session.id}/join`, { taskId: buddyTask }, buddy.accessToken);
    expect(joined.status).toBe(200);
    const { participants } = (await joined.json()) as { participants: { userId: string; state: string }[] };
    expect(participants.map((p) => p.state)).toEqual(['present', 'present']);
    expect((await taskRow(buddyTask)).session_id).toBe(session.id);

    // Present in the session means out of the chat, task or no task.
    const { results } = await env.DB.prepare(
      "SELECT state FROM session_participants WHERE session_id = ? AND user_id = ?",
    )
      .bind(session.id, owner.userId)
      .all<{ state: string }>();
    expect(results[0]!.state).toBe('present');

    await backdateSession(session.id, 50);
    expect((await post(`/api/sessions/${session.id}/end`, {}, buddy.accessToken)).status).toBe(403);
    const ended = await post(`/api/sessions/${session.id}/end`, {}, owner.accessToken);
    expect(ended.status).toBe(200);

    // 50 unverified minutes (25 credits) plus the cooperative bonus (20), each.
    expect((await statsFor(owner.userId)).total_credits).toBe(45);
    // The host opened it live, so they were there for its start.
    const { results: hostRel } = await env.DB.prepare(
      'SELECT reliability_pct FROM user_stats WHERE user_id = ?',
    )
      .bind(owner.userId)
      .all<{ reliability_pct: number | null }>();
    expect(hostRel[0]?.reliability_pct).toBe(100);
    expect((await statsFor(buddy.userId)).total_credits).toBe(45);
    expect((await statsFor(buddy.userId)).current_streak).toBe(1);
    expect((await taskRow(buddyTask)).actual_minutes).toBe(50);
    expect((await taskRow(buddyTask)).started_at).toBeNull();
  });

  it('lets a member leave early, keeping their minutes and costing the group its bonus', async () => {
    const { owner, buddy, groupId } = await pair('leave-early');
    const opened = await post(`/api/groups/${groupId}/sessions`, { plannedMinutes: 50 }, owner.accessToken);
    const { session } = (await opened.json()) as { session: { id: string } };
    await post(`/api/sessions/${session.id}/join`, {}, buddy.accessToken);
    await backdateSession(session.id, 30);

    await post(`/api/sessions/${session.id}/leave`, {}, buddy.accessToken);
    expect((await statsFor(buddy.userId)).total_credits).toBe(15);

    await post(`/api/sessions/${session.id}/end`, {}, owner.accessToken);
    // No bonus: somebody left.
    expect((await statsFor(owner.userId)).total_credits).toBe(15);
  });

  it('can be scheduled, committed to, and started by the host', async () => {
    const { owner, buddy, groupId } = await pair('scheduled');
    const at = new Date(Date.now() + 60 * 60_000).toISOString();
    const opened = await post(
      `/api/groups/${groupId}/sessions`,
      { plannedMinutes: 25, scheduledFor: at },
      owner.accessToken,
    );
    expect(opened.status).toBe(201);
    const { session } = (await opened.json()) as { session: { id: string; state: string } };
    expect(session.state).toBe('scheduled');

    const joined = await post(`/api/sessions/${session.id}/join`, {}, buddy.accessToken);
    const { participants } = (await joined.json()) as { participants: { state: string }[] };
    expect(participants.every((p) => p.state === 'committed')).toBe(true);

    const current = (await (await get(`/api/groups/${groupId}/sessions/current`, buddy.accessToken)).json()) as {
      session: { id: string } | null;
    };
    expect(current.session?.id).toBe(session.id);

    const started = await post(`/api/sessions/${session.id}/start`, {}, owner.accessToken);
    expect(started.status).toBe(200);
    const after = (await started.json()) as { participants: { userId: string; state: string }[] };
    // The host is present; a commitment is not attendance until they join.
    expect(after.participants.find((p) => p.userId === owner.userId)?.state).toBe('present');
    expect(after.participants.find((p) => p.userId === buddy.userId)?.state).toBe('committed');
  });
});

describe('rest days and freezes (PRODUCT.md §3.6)', () => {
  it('allows two declared rest days a week, today or later', async () => {
    const { owner } = await pair('rest-days');
    const d = (offset: number) => {
      const t = new Date();
      t.setUTCDate(t.getUTCDate() + offset);
      return t.toISOString().slice(0, 10);
    };
    expect((await put('/api/me/rest-days', { date: d(-1) }, owner.accessToken)).status).toBe(400);
    expect((await put('/api/me/rest-days', { date: d(0) }, owner.accessToken)).status).toBe(200);
    expect((await put('/api/me/rest-days', { date: d(1) }, owner.accessToken)).status).toBe(200);

    const status = (await (await get('/api/me/rest-days', owner.accessToken)).json()) as {
      usedThisWeek: number;
      freezesAvailable: number;
      maxPerWeek: number;
    };
    // Two in a row can straddle an ISO week boundary; either way the cap is per week.
    expect(status.usedThisWeek).toBeGreaterThanOrEqual(1);
    expect(status.freezesAvailable).toBe(2);
    expect(status.maxPerWeek).toBe(2);

    expect((await del(`/api/me/rest-days/${d(1)}`, owner.accessToken)).status).toBe(200);
  });

  it('spends a freeze rather than breaking a streak, then breaks it when none are left', async () => {
    const { owner } = await pair('freeze');
    const client = db(env.DB);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

    await env.DB.prepare(
      'UPDATE user_stats SET current_streak = 5, last_session_date = ?, freezes_available = 1, freezes_month = ? WHERE user_id = ?',
    )
      .bind(threeDaysAgo, yesterday.slice(0, 7), owner.userId)
      .run();

    await runRollover(client);
    let stats = await statsFor(owner.userId);
    expect(stats.current_streak).toBe(5);
    const { results } = await env.DB.prepare('SELECT source FROM rest_days WHERE user_id = ? AND date = ?')
      .bind(owner.userId, yesterday)
      .all<{ source: string }>();
    expect(results[0]?.source).toBe('freeze');

    // The freeze covered yesterday. Remove it and run again with none left: the chain breaks.
    await env.DB.prepare('DELETE FROM rest_days WHERE user_id = ?').bind(owner.userId).run();
    await runRollover(client);
    stats = await statsFor(owner.userId);
    expect(stats.current_streak).toBe(0);
  });

  it('holds a streak over a declared rest day', async () => {
    const { owner } = await pair('declared-rest');
    const client = db(env.DB);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    await env.DB.prepare(
      "INSERT INTO rest_days (user_id, date, source) VALUES (?, ?, 'declared')",
    )
      .bind(owner.userId, yesterday)
      .run();
    await env.DB.prepare(
      'UPDATE user_stats SET current_streak = 3, last_session_date = ?, freezes_available = 0, freezes_month = ? WHERE user_id = ?',
    )
      .bind(twoDaysAgo, yesterday.slice(0, 7), owner.userId)
      .run();
    await runRollover(client);
    expect((await statsFor(owner.userId)).current_streak).toBe(3);
  });
});
