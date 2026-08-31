import { and, eq, ne, sql } from 'drizzle-orm';

import {
  CREDITS_PER_RATING_POINT,
  DAILY_COMPLETION_BONUS,
  abandonPenalty,
  creditsForRating,
} from '@buddy/shared';

import type { Db } from '../db/client.js';
import { creditLedger, tasks, userStats } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { isoWeekKey, nowIso, previousLocalDate } from '../lib/time.js';

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
    reviewerId: string;
    taskId: string;
    dueDate: string;
    rating: number;
  },
): Promise<ApprovalAward> {
  const { ownerId, reviewerId, taskId, dueDate, rating } = params;
  const credits = creditsForRating(rating);
  const weekKey = isoWeekKey();

  const statements: Parameters<Db['batch']>[0] = [
    // A 0-rating approval still closes the task and still counts as approved;
    // it simply earns nothing. There is no rejected state (§2.4).
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

    db
      .update(userStats)
      .set({
        reviewsGiven: sql`${userStats.reviewsGiven} + 1`,
        updatedAt: nowIso(),
      })
      .where(eq(userStats.userId, reviewerId)),

    ...streakStatements(db, ownerId, dueDate),
  ];

  await db.batch(statements as never);

  const bonus = await maybeAwardDailyBonus(db, ownerId, dueDate);
  const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, ownerId) });

  return { credits, dailyBonus: bonus, streak: stats?.currentStreak ?? 0 };
}

/**
 * Extends the streak in a single statement.
 *
 * Three cases, all expressed as SQL so no read is involved:
 * - the same local day already counted → unchanged
 * - the day before the last counted day → +1
 * - anything older → the chain broke, restart at 1
 *
 * A late review of an *older* day is ignored entirely: approving Monday's task
 * on Wednesday must not rewrite a streak that has already moved past it.
 */
function streakStatements(db: Db, userId: string, dueDate: string) {
  const previous = previousLocalDate(dueDate);

  return [
    db
      .update(userStats)
      .set({
        currentStreak: sql`CASE
          WHEN ${userStats.lastApprovedDate} = ${dueDate} THEN ${userStats.currentStreak}
          WHEN ${userStats.lastApprovedDate} = ${previous} THEN ${userStats.currentStreak} + 1
          ELSE 1 END`,
        bestStreak: sql`MAX(${userStats.bestStreak}, CASE
          WHEN ${userStats.lastApprovedDate} = ${dueDate} THEN ${userStats.currentStreak}
          WHEN ${userStats.lastApprovedDate} = ${previous} THEN ${userStats.currentStreak} + 1
          ELSE 1 END)`,
        lastApprovedDate: sql`MAX(COALESCE(${userStats.lastApprovedDate}, ''), ${dueDate})`,
        updatedAt: nowIso(),
      })
      .where(
        and(
          eq(userStats.userId, userId),
          // Only move the streak forward.
          sql`(${userStats.lastApprovedDate} IS NULL OR ${userStats.lastApprovedDate} <= ${dueDate})`,
        ),
      ),
  ];
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

/**
 * Charges the penalty for abandoning a started task (§2.4).
 *
 * Two details carry the weight here.
 *
 * **The `refId` is the task *and the start time*, not the task.** The ledger's
 * unique index is `(user, reason, ref_type, ref_id)`, which exists to make
 * awards exactly-once. Keying on the task alone would make the *penalty*
 * exactly-once too: start, abandon, restart, abandon again, and the second
 * insert collides with the first and either errors or is silently swallowed.
 * Each start is its own commitment, so each start is its own ledger key.
 *
 * **The charge is capped at the balance.** A leaderboard with negative scores
 * invites a reading the product does not intend, and someone who abandons their
 * very first task should land on zero rather than in debt.
 *
 * Returns the amount actually deducted, as a negative number (0 if the user had
 * nothing to lose, or if this exact start was already charged).
 */
export async function chargeAbandon(
  db: Db,
  userId: string,
  taskId: string,
  startedAt: string,
): Promise<number> {
  const balance = await creditBalance(db, userId);
  const amount = abandonPenalty(balance);
  if (amount === 0) return 0;

  const inserted = await db
    .insert(creditLedger)
    .values({
      id: newId(),
      userId,
      amount,
      reason: 'task_abandoned',
      refType: 'task_start',
      refId: `${taskId}:${startedAt}`,
    })
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });

  // Already charged for this start: the unique index absorbed it.
  if (inserted.length === 0) return 0;

  const weekKey = isoWeekKey();
  await db
    .update(userStats)
    .set({
      // Clamped in SQL as well as above, because the balance is read before the
      // write and a concurrent approval could land in between.
      totalCredits: sql`MAX(0, ${userStats.totalCredits} + ${amount})`,
      weeklyCredits: sql`CASE WHEN ${userStats.weekKey} = ${weekKey}
                              THEN MAX(0, ${userStats.weeklyCredits} + ${amount})
                              ELSE 0 END`,
      weekKey,
      updatedAt: nowIso(),
    })
    .where(eq(userStats.userId, userId));

  return amount;
}
