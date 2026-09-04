import { and, eq, ne, sql } from 'drizzle-orm';

import { CREDITS_PER_RATING_POINT, DAILY_COMPLETION_BONUS, verifiedTopUp } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { creditLedger, tasks, userStats } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { isoWeekKey, nowIso } from '../lib/time.js';

/**
 * Credits, streaks and the daily bonus (§2.5).
 *
 * D1 has no interactive transactions, only `batch()`, which is atomic but cannot
 * branch on its own earlier statements. Two rules follow, and they shape
 * everything here:
 *
 * 1. **Claim before you pay.** The caller flips the task with a guarded UPDATE
 *    that returns rows, and only calls into this module if that claim won. That
 *    is what makes "first review is final" true even for two reviewers tapping
 *    at the same moment — no read-then-write check could.
 * 2. **Counters are relative, never absolute.** `total_credits + ?`, never a
 *    value computed in JS from a prior read. Two approvals for the same user in
 *    the same instant must commute, and a JS-computed total would silently
 *    discard one.
 *
 * The ledger is append-only and carries a unique index on
 * (user, reason, ref_type, ref_id), so every award below is idempotent: a retry
 * after a partial failure cannot double-pay.
 */

export interface ApprovalAward {
  credits: number;
  dailyBonus: number;
  streak: number;
}

/**
 * Applies everything an approval earns, in one atomic batch: the ledger entry,
 * the denormalised stats, and the streak.
 *
 * `dueDate` is the owner's local day the task was planned for — not today —
 * because a task approved after midnight still belongs to the day it was for.
 */
export async function awardApproval(
  db: Db,
  params: {
    ownerId: string;
    /**
     * Null when nobody reviewed it — the rollover closing a task that sat
     * `done` with no reviewer. There is no one to credit with a review, and
     * `task_reviews.reviewer_id` is NOT NULL for the same reason: an
     * unreviewed approval is an absence, not an anonymous reviewer.
     */
    reviewerId: string | null;
    taskId: string;
    dueDate: string;
    rating: number;
    /**
     * Minutes the task had on a clock (PRODUCT.md §3.6, slice 1). An approval
     * pays the *verified* half of those minutes; the unverified half was paid
     * when the clock stopped. The rating is recorded and shown to the owner,
     * and moves no credits — that is what closed the mutual-five-star loophole.
     */
    actualMinutes?: number;
  },
): Promise<ApprovalAward> {
  const { ownerId, reviewerId, taskId, dueDate, rating } = params;
  void rating;
  // Nobody looked, nothing is verified: an unreviewed close pays no top-up.
  const credits = reviewerId ? verifiedTopUp(params.actualMinutes ?? 0) : 0;
  const weekKey = isoWeekKey();

  const statements: Parameters<Db['batch']>[0] = [
    // Recorded in the ledger under the reason that already exists for an
    // approval; the amount is the verified top-up. There is no rejected state
    // (§2.4): a 0-rating approval still closes the task.
    db
      .insert(creditLedger)
      .values({
        id: newId(),
        userId: ownerId,
        amount: credits,
        reason: 'task_approved',
        refType: 'task',
        refId: taskId,
      })
      .onConflictDoNothing(),

    db
      .update(userStats)
      .set({
        totalCredits: sql`${userStats.totalCredits} + ${credits}`,
        // The weekly figure resets when the stored week key is stale, folded
        // into the same statement so there is no read-modify-write.
        weeklyCredits: sql`CASE WHEN ${userStats.weekKey} = ${weekKey}
                                THEN ${userStats.weeklyCredits} + ${credits}
                                ELSE ${credits} END`,
        weekKey,
        tasksApproved: sql`${userStats.tasksApproved} + 1`,
        updatedAt: nowIso(),
      })
      .where(eq(userStats.userId, ownerId)),

    ...(reviewerId
      ? [
          db
            .update(userStats)
            .set({
              reviewsGiven: sql`${userStats.reviewsGiven} + 1`,
              updatedAt: nowIso(),
            })
            .where(eq(userStats.userId, reviewerId)),
        ]
      : []),

    // The streak is no longer moved here: it counts days with a session
    // (services/sessions.ts). `last_approved_date` is still kept, for the
    // profile's "last approved" line.
    db
      .update(userStats)
      .set({
        lastApprovedDate: sql`MAX(COALESCE(${userStats.lastApprovedDate}, ''), ${dueDate})`,
        updatedAt: nowIso(),
      })
      .where(eq(userStats.userId, ownerId)),
  ];

  await db.batch(statements as never);

  /**
   * The daily bonus is for finishing everything you said you would, and an
   * unreviewed close is not evidence of that — it only means nobody looked. So
   * a sweep never *triggers* the bonus, though one already earned by a real
   * approval that day stands: the ledger is keyed on the day and pays once.
   */
  const bonus = reviewerId ? await maybeAwardDailyBonus(db, ownerId, dueDate) : 0;
  const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, ownerId) });

  return { credits, dailyBonus: bonus, streak: stats?.currentStreak ?? 0 };
}

/**
 * The +20 bonus for a day where every planned task was approved (§2.5).
 *
 * Awarded at approval time rather than at rollover, because the state machine
 * lets a task be approved after its day has ended — only `planned` tasks are
 * swept to `missed`. Keyed on the day, so the unique ledger index makes it
 * exactly-once no matter how many approvals land.
 */
async function maybeAwardDailyBonus(
  db: Db,
  ownerId: string,
  dueDate: string,
): Promise<number> {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`,
      unapproved: sql<number>`sum(CASE WHEN ${tasks.status} <> 'approved' THEN 1 ELSE 0 END)`,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, ownerId), eq(tasks.dueDate, dueDate)));

  const total = Number(counts?.total ?? 0);
  const unapproved = Number(counts?.unapproved ?? 0);
  if (total === 0 || unapproved > 0) return 0;

  const inserted = await db
    .insert(creditLedger)
    .values({
      id: newId(),
      userId: ownerId,
      amount: DAILY_COMPLETION_BONUS,
      reason: 'daily_bonus',
      refType: 'day',
      refId: dueDate,
    })
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });

  // Already awarded for this day: the unique index absorbed it.
  if (inserted.length === 0) return 0;

  const weekKey = isoWeekKey();
  await db
    .update(userStats)
    .set({
      totalCredits: sql`${userStats.totalCredits} + ${DAILY_COMPLETION_BONUS}`,
      weeklyCredits: sql`CASE WHEN ${userStats.weekKey} = ${weekKey}
                              THEN ${userStats.weeklyCredits} + ${DAILY_COMPLETION_BONUS}
                              ELSE ${DAILY_COMPLETION_BONUS} END`,
      weekKey,
      updatedAt: nowIso(),
    })
    .where(eq(userStats.userId, ownerId));

  return DAILY_COMPLETION_BONUS;
}

/** Counts a review that did not approve (a proof request), for the reviewer's tally. */
export async function countReview(db: Db, reviewerId: string): Promise<void> {
  await db
    .update(userStats)
    .set({
      reviewsGiven: sql`${userStats.reviewsGiven} + 1`,
      updatedAt: nowIso(),
    })
    .where(eq(userStats.userId, reviewerId));
}

export { CREDITS_PER_RATING_POINT, DAILY_COMPLETION_BONUS };

/** Exported for the leaderboard and profile reads. */
export async function creditBalance(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(sum(${creditLedger.amount}), 0)` })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, userId), ne(creditLedger.amount, 0)));
  return Number(row?.total ?? 0);
}
