import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { NUDGE_HOUR, findUnplannedUsers, runNudges } from '../src/jobs/nudge.js';

import { createTask, pair, resetRateLimits, signUp, onboard } from './helpers.js';

beforeEach(resetRateLimits);

/** Clears the per-timezone markers, so each test starts un-nudged. */
async function resetMarkers() {
  const { keys } = await env.CACHE.list({ prefix: 'nudge:' });
  await Promise.all(keys.map((k) => env.CACHE.delete(k.name)));
}

beforeEach(resetMarkers);

async function setTimezone(userId: string, timezone: string) {
  await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(timezone, userId).run();
}

/** A UTC instant that reads as the nudge hour in UTC itself. */
function atNudgeHour(): Date {
  const d = new Date();
  d.setUTCHours(NUDGE_HOUR, 0, 0, 0);
  return d;
}

const utcToday = (at: Date) => at.toISOString().slice(0, 10);

describe('who gets nudged', () => {
  it('includes someone in a group with nothing planned today', async () => {
    const { owner } = await pair('nudgeidle');
    await setTimezone(owner.userId, 'UTC');

    const idle = await findUnplannedUsers(db(env.DB), 'UTC', utcToday(atNudgeHour()));
    expect(idle).toContain(owner.userId);
  });

  it('leaves out someone who already planned today', async () => {
    const { owner, groupId } = await pair('nudgeplanned');
    await setTimezone(owner.userId, 'UTC');
    await createTask(owner, groupId);

    const idle = await findUnplannedUsers(db(env.DB), 'UTC', utcToday(atNudgeHour()));
    expect(idle).not.toContain(owner.userId);
  });

  it('leaves out someone with no group, who has nowhere to plan a task', async () => {
    const loner = await signUp('nudge-loner@example.com');
    await onboard(loner, 'nudgeloner');
    await setTimezone(loner.userId, 'UTC');

    const idle = await findUnplannedUsers(db(env.DB), 'UTC', utcToday(atNudgeHour()));
    expect(idle).not.toContain(loner.userId);
  });

  it('does not reach across timezones', async () => {
    const { owner } = await pair('nudgetz');
    await setTimezone(owner.userId, 'UTC');

    const idle = await findUnplannedUsers(db(env.DB), 'Asia/Tokyo', utcToday(atNudgeHour()));
    expect(idle).not.toContain(owner.userId);
  });
});

describe('when the nudge fires', () => {
  it('sends nothing at an hour that is not 8am local', async () => {
    const { owner } = await pair('nudgewronghour');
    await setTimezone(owner.userId, 'UTC');

    const noon = atNudgeHour();
    noon.setUTCHours(NUDGE_HOUR + 4);

    const result = await runNudges(db(env.DB), env, noon);
    expect(result.timezones).toBe(0);
    expect(result.nudged).toBe(0);
  });

  it('nudges at 8am local', async () => {
    const { owner } = await pair('nudgefires');
    await setTimezone(owner.userId, 'UTC');

    const result = await runNudges(db(env.DB), env, atNudgeHour());
    expect(result.timezones).toBeGreaterThanOrEqual(1);
    expect(result.nudged).toBeGreaterThanOrEqual(1);
  });

  it('is not sent twice for one local day, however often the cron fires', async () => {
    const { owner } = await pair('nudgeonce');
    await setTimezone(owner.userId, 'UTC');

    const first = await runNudges(db(env.DB), env, atNudgeHour());
    expect(first.nudged).toBeGreaterThanOrEqual(1);

    const second = await runNudges(db(env.DB), env, atNudgeHour());
    expect(second.nudged).toBe(0);
    expect(second.alreadySent).toBeGreaterThanOrEqual(1);
  });

  it('nudges the same timezone again the next local day', async () => {
    const { owner } = await pair('nudgenextday');
    await setTimezone(owner.userId, 'UTC');

    await runNudges(db(env.DB), env, atNudgeHour());

    const tomorrow = atNudgeHour();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const next = await runNudges(db(env.DB), env, tomorrow);
    expect(next.nudged).toBeGreaterThanOrEqual(1);
    expect(next.alreadySent).toBe(0);
  });

  it('carries on past a timezone the runtime cannot resolve', async () => {
    const { owner } = await pair('nudgebadtz');
    await setTimezone(owner.userId, 'UTC');

    const broken = await signUp('nudge-badtz@example.com');
    await onboard(broken, 'nudgebadtz');
    await setTimezone(broken.userId, 'Mars/Olympus_Mons');

    const result = await runNudges(db(env.DB), env, atNudgeHour());
    expect(result.nudged).toBeGreaterThanOrEqual(1);
  });
});
