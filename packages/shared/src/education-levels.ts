import type { OccupationKey } from './occupations';

/**
 * Level of study, asked during signup (§2.1).
 *
 * Buddy is a student product, so this replaces the occupation *question* — but
 * not the `occupation_key` column, which the mobile app and every existing
 * buddy card still read. The API derives that column from this one
 * (`occupationForLevel` below), so an answer here keeps older clients correct
 * without them knowing this list exists.
 *
 * "Level of study" rather than "grade" or "year": grade reads as US school only,
 * and year collides with the year *number* within a level.
 */
export const EDUCATION_LEVELS = [
  { key: 'high_school', label: 'High school' },
  { key: 'foundation', label: 'Foundation / College' },
  { key: 'undergraduate', label: 'Undergraduate' },
  { key: 'masters', label: "Master's" },
  { key: 'phd', label: 'PhD' },
  { key: 'postdoc', label: 'Postdoc' },
  { key: 'recent_graduate', label: 'Recent graduate' },
] as const satisfies readonly { key: string; label: string }[];

export type EducationLevelKey = (typeof EDUCATION_LEVELS)[number]['key'];

export const EDUCATION_LEVEL_KEYS = EDUCATION_LEVELS.map((l) => l.key) as [
  EducationLevelKey,
  ...EducationLevelKey[],
];

export function educationLevelLabel(key: EducationLevelKey): string {
  return EDUCATION_LEVELS.find((l) => l.key === key)!.label;
}

/**
 * The legacy `occupation_key` implied by a level of study.
 *
 * Signup no longer asks the occupation question, but `users.occupation_key` is
 * indexed, CHECK-constrained and read by `apps/mobile`, so the API keeps it
 * populated from this map on every write. Postdocs and PhDs both land on
 * `student_grad` — the closest honest value in a list that predates this one.
 */
export const OCCUPATION_FOR_LEVEL = {
  high_school: 'student_high_school',
  foundation: 'student_undergrad',
  undergraduate: 'student_undergrad',
  masters: 'student_grad',
  phd: 'student_grad',
  postdoc: 'student_grad',
  recent_graduate: 'job_seeker',
} as const satisfies Record<EducationLevelKey, OccupationKey>;

export function occupationForLevel(key: EducationLevelKey): OccupationKey {
  return OCCUPATION_FOR_LEVEL[key];
}
