import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { runRollover } from '../src/jobs/rollover.js';

import { createTask, get, pair, patch, post, resetRateLimits, type Session } from './helpers.js';

beforeEach(resetRateLimits);

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function backdate(id: string, dueDate: string) {
  await env.DB.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').bind(dueDate, id).run();
}

async function row(id: string) {
  const { results } = await env.DB.prepare(
    'SELECT status, started_at as startedAt, due_date as dueDate, estimated_minutes as estimatedMinutes FROM tasks WHERE id = ?',
  )
    .bind(id)
    .all<{ status: string; startedAt: string | null; dueDate: string; estimatedMinutes: number }>();
  return results[0]!;
}

/** A task that the rollover has marked missed, as a real day-change makes one. */
async function missedTask(prefix: string): Promise<{ owner: Session; groupId: string; id: string }> {
  const { owner, groupId } = await pair(prefix);
  const id = await createTask(owner, groupId, 'Overdue essay', undefined, 30);
  await backdate(id, dayOffset(-1));
  await runRollover(db(env.DB));
  expect((await row(id)).status).toBe('missed');
  return { owner, groupId, id };
}

/**
 * Missed is not terminal (§2.4).
 *
 * A day ending is not a verdict on the task, and the whole point of the state
 * is that somebody can pick it back up. These tests exist because for a while
 * they could not: starting a missed task set its clock but left the status
 * alone, so no client read it as running, and the handler's early return then
 * made every later Start a silent no-op.
 */
describe('picking a missed task back up', () => {
  it('starting it makes it a plan again, running, due today', async () => {
    const { owner, id } = await missedTask('revive');

    const res = await post(`/api/tasks/${id}/start`, {}, owner.accessToken);
    expect(res.status).toBe(200);

    const task = await row(id);
    expect(task.status).toBe('planned');
    expect(task.startedAt).toEqual(expect.any(String));
    // Today, not the day it was planned for: the rollover runs hourly and would
    // otherwise mark it missed again while its owner is working on it.
    expect(task.dueDate).toBe(dayOffset(0));
  });

  it('survives the next rollover once revived', async () => {
    const { owner, id } = await missedTask('revivelasts');
    await post(`/api/tasks/${id}/start`, {}, owner.accessToken);

    await runRollover(db(env.DB));

    const task = await row(id);
    expect(task.status).toBe('planned');
    expect(task.startedAt).not.toBeNull();
  });

  /**
   * The self-heal. Rows in this exact state exist in production: started while
   * missed by the handler that did not revive them, leaving a clock nothing
   * reads. Starting has to overwrite that stale timestamp rather than inherit
   * it — a task born hours into overrun is not a fresh start.
   */
  it('heals a missed task left holding a stale clock', async () => {
    const { owner, id } = await missedTask('stale');
    const stale = '2020-01-01T00:00:00.000Z';
    await env.DB.prepare('UPDATE tasks SET started_at = ? WHERE id = ?').bind(stale, id).run();

    const res = await post(`/api/tasks/${id}/start`, {}, owner.accessToken);
    expect(res.status).toBe(200);

    const task = await row(id);
    expect(task.status).toBe('planned');
    expect(task.startedAt).not.toBe(stale);
    expect(Date.parse(task.startedAt!)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('still treats a genuinely running task as already started', async () => {
    const { owner, groupId } = await pair('idempotent');
    const id = await createTask(owner, groupId, 'Reading', undefined, 30);
    await post(`/api/tasks/${id}/start`, {}, owner.accessToken);
    const first = (await row(id)).startedAt;

    await post(`/api/tasks/${id}/start`, {}, owner.accessToken);
    // Restarting would silently reset a clock its owner is being held to.
    expect((await row(id)).startedAt).toBe(first);
  });
});

/** "Not today" and "give it more time", which are both edits to a missed task. */
describe('editing a missed task', () => {
  it('moving it to tomorrow makes it a plan again', async () => {
    const { owner, id } = await missedTask('nottoday');

    const res = await patch(`/api/tasks/${id}`, { dueDate: dayOffset(1) }, owner.accessToken);
    expect(res.status).toBe(200);

    const task = await row(id);
    expect(task.status).toBe('planned');
    expect(task.dueDate).toBe(dayOffset(1));
    // Rescheduling is not starting: no clock runs until they say so.
    expect(task.startedAt).toBeNull();
  });

  it('giving it more time alone leaves it missed', async () => {
    const { owner, id } = await missedTask('moretime');

    const res = await patch(`/api/tasks/${id}`, { estimatedMinutes: 90 }, owner.accessToken);
    expect(res.status).toBe(200);

    const task = await row(id);
    expect(task.estimatedMinutes).toBe(90);
    // Reviving it here would put a `planned` task back on a day that has
    // passed, which the next rollover would mark missed all over again.
    expect(task.status).toBe('missed');
  });

  it('refuses to move it to a day that has already passed', async () => {
    const { owner, id } = await missedTask('nopast');
    const res = await patch(`/api/tasks/${id}`, { dueDate: dayOffset(-2) }, owner.accessToken);
    expect(res.status).toBe(400);
    expect((await row(id)).status).toBe('missed');
  });

  it('still refuses to edit a task that is under review', async () => {
    const { owner, groupId } = await pair('underreview');
    const id = await createTask(owner, groupId, 'Submitted', undefined, 30);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);

    const res = await patch(`/api/tasks/${id}`, { title: 'Renamed' }, owner.accessToken);
    expect(res.status).toBe(409);
  });
});

/** What the group board reads, which is what decides the buttons it offers. */
describe('what a revived task looks like to a client', () => {
  it('reads as running once restarted', async () => {
    const { owner, groupId, id } = await missedTask('clientview');
    await post(`/api/tasks/${id}/start`, {}, owner.accessToken);

    const { tasks: listed } = (await (
      await get(`/api/tasks?scope=all&groupId=${groupId}`, owner.accessToken)
    ).json()) as { tasks: { id: string; status: string; startedAt: string | null }[] };

    const task = listed.find((t) => t.id === id)!;
    // `isRunning` on both clients: a clock, and a status that is still open.
    expect(task.startedAt).not.toBeNull();
    expect(['planned', 'proof_requested']).toContain(task.status);
  });
});
