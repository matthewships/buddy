import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { runRollover } from '../src/jobs/rollover.js';

import { createTask, pair, post, resetRateLimits, statsFor } from './helpers.js';

beforeEach(resetRateLimits);

/** Sets a user's timezone, so local-day behaviour can be exercised. */
async function setTimezone(userId: string, timezone: string) {
  await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(timezone, userId).run();
}

async function taskStatus(id: string): Promise<string> {
  const { results } = await env.DB.prepare('SELECT status FROM tasks WHERE id = ?')
    .bind(id)
    .all<{ status: string }>();
  return results[0]!.status;
}

/** Backdates a task's due date, standing in for the passage of time. */
async function backdate(id: string, dueDate: string) {
  await env.DB.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').bind(dueDate, id).run();
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('day rollover', () => {
  it('marks a planned task from a past day as missed', async () => {
    const { owner, groupId } = await pair('roll');
    const id = await createTask(owner, groupId);
    await backdate(id, daysAgo(1));

    const result = await runRollover(db(env.DB));
    expect(result.missed).toBeGreaterThanOrEqual(1);
    expect(await taskStatus(id)).toBe('missed');
  });

  it('leaves today alone', async () => {
    const { owner, groupId } = await pair('rolltoday');
    const id = await createTask(owner, groupId);

    await runRollover(db(env.DB));
    expect(await taskStatus(id)).toBe('planned');
  });

  it('does not touch tasks that are already done, approved or missed', async () => {
    const { owner, buddy, groupId } = await pair('rollstates');

    const done = await createTask(owner, groupId, 'Done one');
    await post(`/api/tasks/${done}/done`, {}, owner.accessToken);
    await backdate(done, daysAgo(2));

    const approved = await createTask(owner, groupId, 'Approved one');
    await post(`/api/tasks/${approved}/done`, {}, owner.accessToken);
    await post(
      `/api/tasks/${approved}/review`,
      { action: 'approve', rating: 3 },
      buddy.accessToken,
    );
    await backdate(approved, daysAgo(2));

    await runRollover(db(env.DB));

    // Only `planned` is swept — a submitted task still deserves its review.
    expect(await taskStatus(done)).toBe('done');
    expect(await taskStatus(approved)).toBe('approved');
  });

  it('is idempotent — running twice changes nothing further', async () => {
    const { owner, groupId } = await pair('rollidem');
    const id = await createTask(owner, groupId);
    await backdate(id, daysAgo(1));

    const first = await runRollover(db(env.DB));
    const second = await runRollover(db(env.DB));

    expect(first.missed).toBeGreaterThanOrEqual(1);
    // Nothing left to sweep the second time.
    expect(second.missed).toBe(0);
    expect(await taskStatus(id)).toBe('missed');
  });

  it('respects each user timezone rather than UTC', async () => {
    const { owner, groupId } = await pair('rolltz');

    // A user far behind UTC: when it is already tomorrow in UTC, it is still
    // "today" for them, so their task must not be swept.
    await setTimezone(owner.userId, 'Pacific/Niue'); // UTC-11
    const id = await createTask(owner, groupId);

    // Pretend the clock is just past UTC midnight.
    const justAfterUtcMidnight = new Date();
    justAfterUtcMidnight.setUTCHours(0, 30, 0, 0);

    await runRollover(db(env.DB), justAfterUtcMidnight);
    expect(await taskStatus(id)).toBe('planned');
  });

  it('survives a user row with an unusable timezone', async () => {
    const { owner, groupId } = await pair('rollbadtz');
    const other = await pair('rollgoodtz');

    const stranded = await createTask(other.owner, other.groupId);
    await backdate(stranded, daysAgo(1));

    // A timezone the runtime cannot resolve must not stop everyone else's sweep.
    await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?')
      .bind('Mars/Olympus', owner.userId)
      .run();

    await expect(runRollover(db(env.DB))).resolves.toBeTruthy();
    expect(await taskStatus(stranded)).toBe('missed');
  });
});

describe('streaks', () => {
  it('extends across consecutive days and records the best', async () => {
    const { owner, buddy, groupId } = await pair('streak');

    for (const offset of [2, 1, 0]) {
      const id = await createTask(owner, groupId, `Day ${offset}`);
      await backdate(id, daysAgo(offset));
      await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
      await post(`/api/tasks/${id}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);
    }

    const stats = await statsFor(owner.userId);
    expect(stats.current_streak).toBe(3);
    expect(stats.best_streak).toBe(3);
    expect(stats.last_approved_date).toBe(daysAgo(0));
  });

  it('does not double-count two approvals on the same day', async () => {
    const { owner, buddy, groupId } = await pair('streaksame');

    for (const title of ['One', 'Two']) {
      const id = await createTask(owner, groupId, title);
      await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
      await post(`/api/tasks/${id}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);
    }

    expect((await statsFor(owner.userId)).current_streak).toBe(1);
  });

  it('restarts at 1 after a gap', async () => {
    const { owner, buddy, groupId } = await pair('streakgap');

    const old = await createTask(owner, groupId, 'Long ago');
    await backdate(old, daysAgo(10));
    await post(`/api/tasks/${old}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${old}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);
    expect((await statsFor(owner.userId)).current_streak).toBe(1);

    const now = await createTask(owner, groupId, 'Today');
    await post(`/api/tasks/${now}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${now}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);

    const stats = await statsFor(owner.userId);
    expect(stats.current_streak).toBe(1);
    expect(stats.best_streak).toBe(1);
  });

  it('a late review of an older day does not rewrite a newer streak', async () => {
    const { owner, buddy, groupId } = await pair('streaklate');

    // Today gets approved first.
    const todayTask = await createTask(owner, groupId, 'Today');
    await post(`/api/tasks/${todayTask}/done`, {}, owner.accessToken);
    await post(
      `/api/tasks/${todayTask}/review`,
      { action: 'approve', rating: 2 },
      buddy.accessToken,
    );
    const before = await statsFor(owner.userId);

    // Then a task from a week ago is finally reviewed.
    const oldTask = await createTask(owner, groupId, 'Old');
    await backdate(oldTask, daysAgo(7));
    await post(`/api/tasks/${oldTask}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${oldTask}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);

    const after = await statsFor(owner.userId);
    // The streak and its anchor day are untouched by the backfill.
    expect(after.current_streak).toBe(before.current_streak);
    expect(after.last_approved_date).toBe(before.last_approved_date);
    // The credits still landed, though.
    expect(after.total_credits).toBeGreaterThan(before.total_credits);
  });

  it('breaks a streak once the user goes quiet for a day', async () => {
    const { owner, buddy, groupId } = await pair('streakbreak');

    const old = await createTask(owner, groupId, 'Two days ago');
    await backdate(old, daysAgo(2));
    await post(`/api/tasks/${old}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${old}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);
    expect((await statsFor(owner.userId)).current_streak).toBe(1);

    // The cron notices nothing was approved yesterday or today.
    const result = await runRollover(db(env.DB));
    expect(result.streaksReset).toBeGreaterThanOrEqual(1);

    const stats = await statsFor(owner.userId);
    expect(stats.current_streak).toBe(0);
    // The best is a record, so it survives.
    expect(stats.best_streak).toBe(1);
  });

  it('does not break a streak that is still current', async () => {
    const { owner, buddy, groupId } = await pair('streakkeep');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${id}/review`, { action: 'approve', rating: 2 }, buddy.accessToken);

    await runRollover(db(env.DB));
    expect((await statsFor(owner.userId)).current_streak).toBe(1);
  });
});
