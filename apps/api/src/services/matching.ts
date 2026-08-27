import { ACTIVE_NOW_MS } from '@buddy/shared';

/**
 * Buddy directory ordering (§2.2).
 *
 * "Same goal first, then same occupation, then most recently active." That is
 * expressed as a score computed in SQL rather than sorted in the Worker, because
 * the directory is paged: sorting a page after fetching it would produce a
 * different order per page and duplicate or drop rows across cursors.
 *
 * The score is deliberately coarse — goal match dominates occupation match,
 * which dominates recency — so ties break on activity without recency ever
 * outranking a goal match.
 */
export const MATCH_SCORE = {
  sameGoal: 4,
  sameOccupation: 2,
  activeNow: 1,
} as const;

export interface DirectoryFilters {
  goal?: string;
  occupation?: string;
  activeOnly?: boolean;
}

/** The cutoff for "Active now" (§4.2). */
export function activeSince(now: Date = new Date()): string {
  return new Date(now.getTime() - ACTIVE_NOW_MS).toISOString();
}

/**
 * Human-readable activity, computed server-side so every client agrees and no
 * device-clock skew leaks into the label.
 */
export function activityLabel(lastSeenAt: string | null, now: Date = new Date()): string {
  if (!lastSeenAt) return 'New here';

  const elapsed = now.getTime() - Date.parse(lastSeenAt);
  if (elapsed < 2 * 60 * 1000) return 'Active now';
  if (elapsed < 60 * 60 * 1000) return `Active ${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(elapsed / 3_600_000);
    return `Active ${hours}h ago`;
  }
  const days = Math.floor(elapsed / 86_400_000);
  return days === 1 ? 'Active yesterday' : `Active ${days}d ago`;
}
