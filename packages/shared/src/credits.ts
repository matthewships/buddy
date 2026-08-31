/**
 * Credit and streak rules (§2.5). All tunable numbers live here so the
 * economy can be rebalanced without touching the award logic.
 */

/** Credits granted when a task is approved: `rating × CREDITS_PER_RATING_POINT`. */
export const CREDITS_PER_RATING_POINT = 10;

/** Bonus when every task planned for a local day ends up approved. */
export const DAILY_COMPLETION_BONUS = 20;

/**
 * What abandoning a started task costs (§2.4).
 *
 * Starting a task locks the owner out of their group chat until it ends, and
 * abandoning is the way out. The cost exists so that "out" is a real decision
 * rather than a free undo — one rating point's worth, the same as a task
 * approved at 1/5.
 *
 * The deduction is capped at the balance, so nobody ends up in debt: see
 * `abandonPenalty`.
 */
export const ABANDON_PENALTY = 10;

/**
 * The deduction to write for a given balance, as a negative number.
 *
 * Floored at zero rather than allowed to go negative. A leaderboard with
 * negative scores invites a reading the product does not intend — that the
 * people at the bottom are worse than absent — and someone who abandons their
 * first ever task should land on nothing, not on a debt.
 */
export function abandonPenalty(balance: number): number {
  const capped = Math.min(ABANDON_PENALTY, Math.max(0, balance));
  // Not `-capped`: negating zero gives -0, which is arithmetically identical
  // and not identical to 0 under Object.is, so it would leak a surprise into
  // any strict comparison downstream.
  return capped === 0 ? 0 : -capped;
}

/** Ratings a reviewer may give. 0 is an effective rejection: it earns nothing. */
export const MIN_RATING = 0;
export const MAX_RATING = 5;

export function creditsForRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new RangeError(`rating must be an integer ${MIN_RATING}-${MAX_RATING}, got ${rating}`);
  }
  return rating * CREDITS_PER_RATING_POINT;
}

/** Every way the ledger can move. The ledger is append-only; balances are sums. */
export const CREDIT_REASONS = [
  'task_approved',
  'daily_bonus',
  'streak',
  /** A started task the owner walked away from — the only negative entry. */
  'task_abandoned',
  'admin_adjust',
] as const;

export type CreditReason = (typeof CREDIT_REASONS)[number];
