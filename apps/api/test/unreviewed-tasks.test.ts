import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { runRollover } from '../src/jobs/rollover.js';

import { createTask, get, pair, post, resetRateLimits, type Session } from './helpers.js';

beforeEach(resetRateLimits);

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function backdate(id: string, dueDate: string) {
  await env.DB.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').bind(dueDate, id).run();
}

async function status(id: string): Promise<string> {
  const { results } = await env.DB.prepare('SELECT status FROM tasks WHERE id = ?')
    .bind(id)
    .all<{ status: string }>();
  return results[0]!.status;
}

async function reviewCount(id: string): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) as n FROM task_reviews WHERE task_id = ?',
  )
    .bind(id)
    .all<{ n: number }>();
  return results[0]!.n;
}

/** Credits, streak and reviews given all live on the public profile. */
async function stats(session: Session, handle: string) {
  const res = await get(`/api/users/${handle}`, session.accessToken);
  const body = (await res.json()) as {
    stats: { totalCredits: number; currentStreak: number; reviewsGiven: number };
  };
  return body.stats;
}

/** A task its owner marked done, backdated so no reviewer ever saw it. */
async function abandoned(prefix: string, daysAgo: number) {
  const { owner, buddy, groupId, ownerHandle, buddyHandle } = await pair(prefix);
  const id = await createTask(owner, groupId, 'Finish the problem set', undefined, 30);
  await post(`/api/tasks/${id}/done`, { proofText: 'All eight questions' }, owner.accessToken);
  expect(await status(id)).toBe('done');
  await backdate(id, dayOffset(daysAgo));
  return { owner, buddy, groupId, id, ownerHandle, buddyHandle };
}

/**
 * A task marked done that nobody reviews used to be a dead end: the `planned`
 * sweep never touched it, so it stayed `done` for ever — earning nothing,
 * never closing, and breaking the streak of the person who had actually done
 * the work. These tests are the rule that they close instead.
 */
describe('tasks nobody ever reviewed', () => {
  it('closes one that has been waiting more than a full extra day', async () => {
    const { id } = await abandoned('stranded', -2);

    await runRollover(db(env.DB));

    expect(await status(id)).toBe('approved');
  });

  it('leaves yesterday alone, so a reviewer still has their whole day', async () => {
    const { id } = await abandoned('overnight', -1);

    await runRollover(db(env.DB));

    expect(await status(id)).toBe('done');
  });

  it('leaves today alone', async () => {
    const { id } = await abandoned('sametoday', 0);

    await runRollover(db(env.DB));

    expect(await status(id)).toBe('done');
  });

  it('counts the day as approved for the person who did the work', async () => {
    const { owner, ownerHandle, id } = await abandoned('streakkept', -2);

    await runRollover(db(env.DB));

    expect(await status(id)).toBe('approved');
    // The day is on the record. Whether it extends a streak depends on the
    // days either side of it, which this user does not have.
    expect((await stats(owner, ownerHandle)).tasksApproved).toBe(1);
  });

  /**
   * The gap this closes. A reviewer gets a full extra day, so an approval can
   * land two days after the day it belongs to — and the streak reset used to
   * fire in between, zeroing the streak of the one person who had done
   * everything asked of them.
   */
  it('does not break a streak while a reviewer still has work in front of them', async () => {
    const { owner, ownerHandle, buddy, groupId } = await pair('streakheld');

    // A real approval yesterday, so there is a live streak to protect. The
    // API refuses a task dated in the past, so it is created today and moved.
    const yesterday = await createTask(owner, groupId, 'Yesterday', undefined, 20);
    await backdate(yesterday, dayOffset(-1));
    await post(`/api/tasks/${yesterday}/done`, {}, owner.accessToken);
    await post(
      `/api/tasks/${yesterday}/review`,
      { action: 'approve', rating: 3 },
      buddy.accessToken,
    );
    expect((await stats(owner, ownerHandle)).currentStreak).toBeGreaterThan(0);

    // Today's work is done and waiting on the buddy, who has not looked.
    const todays = await createTask(owner, groupId, 'Today', undefined, 20);
    await post(`/api/tasks/${todays}/done`, {}, owner.accessToken);

    await runRollover(db(env.DB));

    expect((await stats(owner, ownerHandle)).currentStreak).toBeGreaterThan(0);
  });

  it('still breaks a streak for someone who simply stopped', async () => {
    const { owner, ownerHandle, buddy, groupId } = await pair('streakbroken');

    const old = await createTask(owner, groupId, 'Long ago', undefined, 20);
    await backdate(old, dayOffset(-4));
    await post(`/api/tasks/${old}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${old}/review`, { action: 'approve', rating: 3 }, buddy.accessToken);
    expect((await stats(owner, ownerHandle)).currentStreak).toBeGreaterThan(0);

    // Nothing since, and nothing waiting on anyone else.
    await runRollover(db(env.DB));

    expect((await stats(owner, ownerHandle)).currentStreak).toBe(0);
  });

  it('pays nothing, because nobody checked the work', async () => {
    const { owner, ownerHandle, id } = await abandoned('nopay', -2);
    const before = await stats(owner, ownerHandle);

    await runRollover(db(env.DB));

    expect(await status(id)).toBe('approved');
    expect((await stats(owner, ownerHandle)).totalCredits).toBe(before.totalCredits);
  });

  /**
   * `task_reviews.reviewer_id` is NOT NULL, and there was no reviewer. Writing
   * a row would mean naming somebody who never looked at it.
   */
  it('records no review, because none happened', async () => {
    const { id } = await abandoned('noreviewrow', -2);

    await runRollover(db(env.DB));

    expect(await reviewCount(id)).toBe(0);
  });

  it('credits nobody with having given a review', async () => {
    const { buddy, buddyHandle, id } = await abandoned('noreviewer', -2);

    await runRollover(db(env.DB));

    expect(await status(id)).toBe('approved');
    // The buddy never reviewed anything; the sweep must not pretend they did.
    expect((await stats(buddy, buddyHandle)).reviewsGiven).toBe(0);
  });

  it('is idempotent — a second run neither re-closes nor re-pays', async () => {
    const { owner, ownerHandle, id } = await abandoned('idempotent', -2);

    await runRollover(db(env.DB));
    const after = await stats(owner, ownerHandle);
    await runRollover(db(env.DB));

    expect(await status(id)).toBe('approved');
    expect((await stats(owner, ownerHandle)).totalCredits).toBe(after.totalCredits);
  });

  it('does not touch a task still waiting on requested proof', async () => {
    const { buddy, id } = await abandoned('proofwait', -2);
    await post(`/api/tasks/${id}/review`, { action: 'request_proof' }, buddy.accessToken);
    expect(await status(id)).toBe('proof_requested');

    await runRollover(db(env.DB));

    // The ball is in the owner's court, not the reviewer's — a different
    // problem, and not one this sweep should silently resolve.
    expect(await status(id)).toBe('proof_requested');
  });

  it('still lets a real review land first, and pays for it', async () => {
    const { buddy, owner, ownerHandle, id } = await abandoned('realreview', -2);

    await post(`/api/tasks/${id}/review`, { action: 'approve', rating: 4 }, buddy.accessToken);
    await runRollover(db(env.DB));

    expect(await status(id)).toBe('approved');
    expect((await stats(owner, ownerHandle)).totalCredits).toBeGreaterThan(0);
    expect(await reviewCount(id)).toBe(1);
  });
});
