/**
 * Credit and streak rules (§2.5). All tunable numbers live here so the
 * economy can be rebalanced without touching the award logic.
 */

/** Credits granted when a task is approved: `rating × CREDITS_PER_RATING_POINT`. */
export const CREDITS_PER_RATING_POINT = 10;

/** Bonus when every task planned for a local day ends up approved. */
export const DAILY_COMPLETION_BONUS = 20;

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
  'admin_adjust',
] as const;

export type CreditReason = (typeof CREDIT_REASONS)[number];
