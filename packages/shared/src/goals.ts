/**
 * Goal suggestions offered during registration (§2.1 step 3).
 *
 * Everyone picks one of these or writes their own; the pair
 * (`goal_key`, `goal_text`) is stored on the user and drives buddy matching
 * in both directions. Editing this list needs no other code change — the app
 * renders the chips from it and the API validates against it.
 */
export const GOALS = [
  { key: 'final_exam', label: 'Final exam' },
  { key: 'university_project', label: 'University project' },
  { key: 'thesis', label: 'Thesis / dissertation' },
  { key: 'sat', label: 'SAT' },
  { key: 'ielts_toefl', label: 'IELTS / TOEFL' },
  { key: 'fitness', label: 'Getting fit' },
  { key: 'language', label: 'Learning a language' },
  { key: 'job_hunting', label: 'Job hunting' },
  { key: 'startup', label: 'Building a startup / side project' },
  { key: 'reading', label: 'Reading habit' },
  { key: 'coding', label: 'Coding / learning to program' },
  { key: 'custom', label: 'Other' },
] as const satisfies readonly { key: string; label: string }[];

export type GoalKey = (typeof GOALS)[number]['key'];

export const GOAL_KEYS = GOALS.map((g) => g.key) as [GoalKey, ...GoalKey[]];

export function goalLabel(key: GoalKey): string {
  return GOALS.find((g) => g.key === key)!.label;
}

/**
 * How many goals get their own indexed column on `users`, not how many a person
 * may pick — signup no longer caps the picker at all. The first two are stored
 * as `goal_key` and `goal_key_2` because those are what matching, the directory
 * filters and the mobile app read; the whole ordered list is kept alongside
 * them in `goal_keys`.
 *
 * So this is the width of the *indexed* pair. A buddy card still shows two, for
 * the reason it always did: a card listing six goals stops being scannable.
 */
export const MAX_INDEXED_GOALS = 2;

/**
 * @deprecated The picker is uncapped; use {@link MAX_INDEXED_GOALS} when you
 * mean the two indexed columns. Kept so a client compiled against the old name
 * still builds.
 */
export const MAX_GOALS = MAX_INDEXED_GOALS;
