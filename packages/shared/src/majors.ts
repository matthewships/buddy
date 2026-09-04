/**
 * Field of study, asked during signup (§2.1).
 *
 * Broad fields rather than degree titles: a directory filter is only useful if
 * enough people share a value, and "BSc Computer Science with Industrial
 * Placement" shares nothing with anyone. Anything not here is `custom` plus
 * `major_text`, the same pair-of-columns pattern as goals and occupations.
 *
 * The list has to answer for two populations at once. `level-fit.ts` hides the
 * degree-only rows from a high-school student, but hiding is only half of it:
 * Geography, Religious Studies and Drama are core school subjects that were
 * missing outright, so a sixteen-year-old studying them had nothing to pick but
 * `Other`. All three are also real degrees, which is why they are added to the
 * one list rather than kept in a school-only one — a second list would need a
 * second column, a second CHECK, and a rule for which one the directory
 * filters on.
 */
export const MAJORS = [
  { key: 'computer_science', label: 'Computer Science' },
  { key: 'software_engineering', label: 'Software Engineering' },
  { key: 'data_science', label: 'Data Science / AI' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'physics', label: 'Physics' },
  { key: 'chemistry', label: 'Chemistry' },
  { key: 'biology', label: 'Biology / Life Sciences' },
  { key: 'medicine', label: 'Medicine' },
  { key: 'nursing', label: 'Nursing / Healthcare' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'psychology', label: 'Psychology' },
  { key: 'economics', label: 'Economics' },
  { key: 'business', label: 'Business / Management' },
  { key: 'finance', label: 'Finance / Accounting' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'law', label: 'Law' },
  { key: 'politics', label: 'Politics / International Relations' },
  { key: 'sociology', label: 'Sociology / Anthropology' },
  { key: 'geography', label: 'Geography' },
  { key: 'education', label: 'Education / Teaching' },
  { key: 'history', label: 'History' },
  { key: 'philosophy', label: 'Philosophy' },
  { key: 'religious_studies', label: 'Religious Studies / Theology' },
  { key: 'languages', label: 'Languages / Linguistics' },
  { key: 'literature', label: 'Literature / English' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'design', label: 'Design' },
  { key: 'art', label: 'Art' },
  { key: 'music', label: 'Music / Performing Arts' },
  { key: 'drama', label: 'Drama / Theatre' },
  { key: 'media', label: 'Media / Journalism' },
  { key: 'environment', label: 'Environmental Science' },
  { key: 'agriculture', label: 'Agriculture' },
  { key: 'sports_science', label: 'Sports Science / PE' },
  { key: 'undecided', label: 'Undecided' },
  { key: 'custom', label: 'Other' },
] as const satisfies readonly { key: string; label: string }[];

export type MajorKey = (typeof MAJORS)[number]['key'];

export const MAJOR_KEYS = MAJORS.map((m) => m.key) as [MajorKey, ...MajorKey[]];

export function majorLabel(key: MajorKey): string {
  return MAJORS.find((m) => m.key === key)!.label;
}
