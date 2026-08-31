import { ACTIVE_NOW_MS } from '@buddy/shared';

/**
 * Buddy directory ordering (§2.2).
 *
 * "Same goal first, then same occupation, then most recently active." That is
 * expressed as a score computed in SQL rather than sorted in the Worker, because
 * the directory is paged: sorting a page after fetching it would produce a
 * different order per page and duplicate or drop rows across cursors.
 *
 * The weights are powers of two, which makes the ranking strictly
 * lexicographic: each signal outweighs every weaker signal *combined*, so the
 * order below is the whole rule. A shared goal beats any pile of soft matches;
 * among people who share a goal, the same campus decides; and so on down to
 * recency, which only ever separates people who tie on everything else.
 *
 * That property is worth the odd-looking numbers. With hand-tuned weights,
 * adding one more signal quietly changes what the existing ones mean — three
 * small matches start outranking a goal, and nobody notices until the directory
 * looks wrong. Here, adding a signal means inserting it at the right rank.
 *
 * `sameInstitution` sits second because it is the one thing here that makes
 * meeting in person possible. It is compared on `institution_normalised`, using
 * the same `normaliseInstitution()` the "same institution as me" filter uses —
 * if the two ever diverged, the sort would promote someone the filter hides.
 */
export const MATCH_SCORE = {
  sameGoal: 128,
  sameInstitution: 64,
  sameMajor: 32,
  sameOccupation: 16,
  sameLevel: 8,
  sharedTopic: 4,
  sameCountry: 2,
  activeNow: 1,
} as const;

export interface DirectoryFilters {
  goal?: string;
  occupation?: string;
  level?: string;
  major?: string;
  country?: string;
  topic?: string;
  sameInstitution?: boolean;
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
