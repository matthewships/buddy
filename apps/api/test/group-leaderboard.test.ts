import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { addMember, get, onboard, pair, resetRateLimits, signUp } from './helpers.js';
import { isoWeekKey } from '../src/lib/time.js';

beforeEach(resetRateLimits);

/**
 * Seeds a stats row directly. The crediting rules have their own tests; what
 * this file is about is how a set of numbers becomes an ordered list.
 */
async function setStats(
  userId: string,
  stats: { total?: number; weekly?: number; weekKey?: string; streak?: number },
) {
  await env.DB.prepare(
    `INSERT INTO user_stats (user_id, total_credits, weekly_credits, week_key, current_streak)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       total_credits = excluded.total_credits,
       weekly_credits = excluded.weekly_credits,
       week_key = excluded.week_key,
       current_streak = excluded.current_streak`,
  )
    .bind(
      userId,
      stats.total ?? 0,
      stats.weekly ?? 0,
      stats.weekKey ?? isoWeekKey(),
      stats.streak ?? 0,
    )
    .run();
}

interface Entry {
  rank: number;
  userId: string;
  credits: number;
  currentStreak: number;
}

async function board(groupId: string, token: string, scope = 'alltime') {
  const res = await get(`/api/groups/${groupId}/leaderboard?scope=${scope}`, token);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { scope: string; entries: Entry[] };
  return body.entries;
}

describe('group leaderboard', () => {
  it('refuses somebody who is not in the group', async () => {
    const { groupId } = await pair('glbouncer');
    const outsider = await signUp('glb-outsider@example.com');
    await onboard(outsider, 'glboutsider');

    const res = await get(`/api/groups/${groupId}/leaderboard`, outsider.accessToken);
    expect(res.status).toBe(403);
  });

  it('lists every member, including one who has never earned anything', async () => {
    const { owner, buddy, groupId } = await pair('glbempty');
    await setStats(owner.userId, { total: 40 });

    const entries = await board(groupId, owner.accessToken);
    expect(entries.map((e) => e.userId).sort()).toEqual([owner.userId, buddy.userId].sort());
    expect(entries.find((e) => e.userId === buddy.userId)!.credits).toBe(0);
  });

  it('orders by credits, highest first', async () => {
    const { owner, buddy, groupId } = await pair('glborder');
    await setStats(owner.userId, { total: 10 });
    await setStats(buddy.userId, { total: 90 });

    const entries = await board(groupId, owner.accessToken);
    expect(entries[0]!.userId).toBe(buddy.userId);
    expect(entries[0]!.rank).toBe(1);
    expect(entries[1]!.rank).toBe(2);
  });

  it('gives equal credits the same rank', async () => {
    const { owner, buddy, groupId } = await pair('glbtie');
    await setStats(owner.userId, { total: 0 });
    await setStats(buddy.userId, { total: 0 });

    const entries = await board(groupId, owner.accessToken);
    expect(entries.map((e) => e.rank)).toEqual([1, 1]);
  });

  it('ranks the person behind a tie by their position, not by the tie count', async () => {
    const { owner, buddy, groupId } = await pair('glbtie3');
    const third = await addMember(owner, groupId, 'glb-third@example.com', 'glbthird');
    await setStats(owner.userId, { total: 50 });
    await setStats(buddy.userId, { total: 50 });
    await setStats(third.userId, { total: 5 });

    const entries = await board(groupId, owner.accessToken);
    // Competition ranking: two firsts, then third — never a second nobody holds.
    expect(entries.map((e) => e.rank)).toEqual([1, 1, 3]);
    expect(entries[2]!.userId).toBe(third.userId);
  });

  it('ignores weekly credits left over from a past week', async () => {
    const { owner, buddy, groupId } = await pair('glbstale');
    await setStats(owner.userId, { total: 500, weekly: 500, weekKey: '2020-W01' });
    await setStats(buddy.userId, { total: 10, weekly: 10 });

    const weekly = await board(groupId, owner.accessToken, 'weekly');
    expect(weekly.find((e) => e.userId === owner.userId)!.credits).toBe(0);
    // ...and the stale figure must not have decided the order either.
    expect(weekly[0]!.userId).toBe(buddy.userId);

    const alltime = await board(groupId, owner.accessToken, 'alltime');
    expect(alltime[0]!.userId).toBe(owner.userId);
  });
});
