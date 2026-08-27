/**
 * Occupation suggestions offered during registration (§2.1 step 4).
 *
 * Stored as (`occupation_key`, `occupation_text`), where the free text is an
 * optional detail such as a field of study or a job title. Like goals, this is
 * the only place the list is defined.
 */
export const OCCUPATIONS = [
  { key: 'student_high_school', label: 'Student — High school' },
  { key: 'student_undergrad', label: 'Student — Undergraduate' },
  { key: 'student_grad', label: "Student — Graduate (Master's / PhD)" },
  { key: 'employee', label: 'Employee' },
  { key: 'self_employed', label: 'Self-employed / Freelancer' },
  { key: 'job_seeker', label: 'Job seeker' },
  { key: 'custom', label: 'Other' },
] as const satisfies readonly { key: string; label: string }[];

export type OccupationKey = (typeof OCCUPATIONS)[number]['key'];

export const OCCUPATION_KEYS = OCCUPATIONS.map((o) => o.key) as [
  OccupationKey,
  ...OccupationKey[],
];

export function occupationLabel(key: OccupationKey): string {
  return OCCUPATIONS.find((o) => o.key === key)!.label;
}
