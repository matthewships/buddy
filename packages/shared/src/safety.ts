import { ageOn } from './age';

/**
 * The safety floor (PRODUCT.md §6, slice 0): blocking, muting, leaving with a
 * reason, quiet hours, and the line between minors and adults in matching.
 *
 * Everything here is data or arithmetic that both the API and the clients
 * need to agree on. None of it is a table: the tables are in apps/api.
 */

/**
 * Why somebody left a group. Private to the leaver — it feeds group health
 * and matching later, never the leaver's profile — and optional, because a
 * reason demanded is a reason invented.
 *
 * Not CHECK-constrained in the database, like `STATUSES`: retiring one should
 * stay a config change rather than a migration.
 */
export const LEAVE_REASONS = [
  { key: 'done', label: 'We finished what we set out to do' },
  { key: 'quiet', label: 'Nobody was checking in any more' },
  { key: 'pressure', label: 'Too much pressure' },
  { key: 'mismatch', label: 'Different goals or pace' },
  { key: 'person', label: 'A problem with someone here' },
  { key: 'other', label: 'Something else' },
] as const;

export type LeaveReasonKey = (typeof LEAVE_REASONS)[number]['key'];
export const LEAVE_REASON_KEYS = LEAVE_REASONS.map((r) => r.key) as [
  LeaveReasonKey,
  ...LeaveReasonKey[],
];

/**
 * Quiet hours (PRODUCT.md §5.3): the local hours between which nothing
 * nudges. Stored per user as two hours on a 24-hour clock; the default is
 * eleven at night to seven in the morning. A range that wraps midnight is the
 * normal case, so `inQuietHours` handles start > end.
 */
export const DEFAULT_QUIET_HOURS_START = 23;
export const DEFAULT_QUIET_HOURS_END = 7;

/** Whether `hour` (0–23, local) falls inside the quiet window. Start == end means no window. */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Push notification types that count as a nudge and so respect quiet hours.
 * A buddy request or a chat message is a person reaching out and is not
 * silenced; the product reaching out is.
 */
export const QUIET_PUSH_TYPES = new Set(['daily_nudge', 'start_nudge', 'buddy_nudge', 'checkin']);

/**
 * The adult line for matching (PRODUCT.md §6.3). The signup floor is
 * `MIN_AGE_YEARS`; this is the second line, above which somebody is matched
 * with strangers of any age and below which only with other minors.
 */
export const ADULT_AGE_YEARS = 18;

/**
 * Whether a date of birth places somebody under the adult line today.
 *
 * `null` for an account with no recorded birth date (every account created
 * before the age gate, and every mobile signup), and that null is read as
 * "adult" by matching: an unanswered age is not a young one, and the
 * alternative — refusing to match anyone with an unknown age — would empty
 * the directory for everybody who signed up before 2026-09-02.
 */
export function isMinor(dateOfBirth: string | null | undefined, on: Date = new Date()): boolean | null {
  if (!dateOfBirth) return null;
  const age = ageOn(dateOfBirth, on);
  if (age === null) return null;
  return age < ADULT_AGE_YEARS;
}
