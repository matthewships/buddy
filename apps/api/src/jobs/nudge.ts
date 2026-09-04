import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { Env } from '../env.js';
import { localDate, localHour } from '../lib/time.js';
import { enqueuePush } from '../services/push.js';

/**
 * The daily nudge (§4.9) — one push, at 8am local, to people who have not
 * planned anything for today.
 *
 * **Why it rides the rollover cron.** The trigger is already hourly, because
 * local midnight lands on a different UTC hour in every timezone; local 8am has
 * exactly the same shape. Every whole- and half-hour offset in use maps to
 * precisely one UTC hour whose local hour reads 8, so an hourly firing sends
 * each timezone exactly one nudge a day with no schedule of its own.
 *
 * **Unlike the rollover, this one is schedule-exact, and it has to be.** A
 * rollover that runs twice changes nothing the second time; a notification that
 * arrives twice is two notifications. So it is gated two ways: on the local
 * hour, and on a KV key per timezone-day that a repeated firing finds already
 * set. A dropped firing means no nudge for that timezone that day, which is the
 * right failure — the alternative is sending yesterday's nudge at 3pm.
 */

/** Local wall-clock hour the nudge is sent at. */
export const NUDGE_HOUR = 8;

/**
 * How long the per-timezone marker outlives its day. Comfortably past 24h so a
 * timezone cannot be nudged twice for one local day, and short enough that the
 * keys do not accumulate.
 */
const NUDGE_MARKER_TTL_SECONDS = 30 * 60 * 60;

/** Users per queue message. One message per timezone would work; this bounds it. */
const NUDGE_BATCH = 500;

export interface NudgeResult {
  /** Timezones whose local hour was 8 on this firing. */
  timezones: number;
  /** People pushed to. */
  nudged: number;
  /** Timezones skipped because they had already been nudged for their local day. */
  alreadySent: number;
}

/**
 * Everyone in `timezone` with a group to plan in and nothing on today's board.
 *
 * The group condition is not a detail: a task belongs to a group, so someone
 * who has not joined one cannot act on this notification at all. Telling them
 * to plan a task they have no way to plan is worse than saying nothing.
 */
export async function findUnplannedUsers(
  db: Db,
  timezone: string,
  today: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.timezone, timezone),
        sql`${users.deletedAt} IS NULL`,
        sql`EXISTS (SELECT 1 FROM group_members WHERE group_members.user_id = ${users.id})`,
        sql`NOT EXISTS (SELECT 1 FROM tasks WHERE tasks.user_id = ${users.id} AND tasks.due_date = ${today})`,
      ),
    );

  return rows.map((row) => row.id);
}

export async function runNudges(db: Db, env: Env, now: Date = new Date()): Promise<NudgeResult> {
  const zones = await db
    .selectDistinct({ timezone: users.timezone })
    .from(users)
    .where(sql`${users.deletedAt} IS NULL`);

  let timezones = 0;
  let nudged = 0;
  let alreadySent = 0;

  for (const { timezone } of zones) {
    let hour: number;
    let today: string;
    try {
      hour = localHour(timezone, now);
      today = localDate(timezone, now);
    } catch {
      // A row with a timezone the runtime doesn't know must not stop the job
      // for everyone else — the same tolerance the rollover applies.
      console.error(`[nudge] unknown timezone ${timezone}`);
      continue;
    }

    if (hour !== NUDGE_HOUR) continue;
    timezones += 1;

    const marker = `nudge:${timezone}:${today}`;
    if (await env.CACHE.get(marker)) {
      alreadySent += 1;
      continue;
    }
    // Claimed before sending, not after: a duplicate firing that overlaps this
    // one must find the key already there. The cost of claiming first is a
    // dropped nudge if the enqueue then fails, which is quieter than a double.
    await env.CACHE.put(marker, '1', { expirationTtl: NUDGE_MARKER_TTL_SECONDS });

    const candidates = await findUnplannedUsers(db, timezone, today);

    for (let i = 0; i < candidates.length; i += NUDGE_BATCH) {
      await enqueuePush(env, {
        userIds: candidates.slice(i, i + NUDGE_BATCH),
        title: 'Nothing planned for today',
        body: 'Set one task — your group can see it, and that is the point.',
        // Expo Router's path; the web service worker rewrites /today to the
        // groups screen, where the web keeps its tasks.
        data: { type: 'daily_nudge', url: '/(tabs)/today' },
      });
    }

    nudged += candidates.length;
  }

  return { timezones, nudged, alreadySent };
}
