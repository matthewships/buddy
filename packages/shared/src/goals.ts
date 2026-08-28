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
 * How many goals a user may pick. Two, because most people are juggling one
 * big thing and one habit, and a buddy card stops being scannable past that.
 * The second goal is optional; `goal_key` is still the primary one and the
 * only one older clients read.
 */
export const MAX_GOALS = 2;
