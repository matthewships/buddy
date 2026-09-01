import type { EducationLevelKey } from './education-levels';
import { GOALS, type GoalKey } from './goals';
import { MAJORS, type MajorKey } from './majors';

/**
 * Which goals and subjects to *offer* someone, given their level of study.
 *
 * A high-school student was being asked to pick between "Thesis / dissertation"
 * and "University project", and to choose a field of study from a list
 * containing Pharmacy, Nursing and Architecture. None of that is a question
 * they can answer, and a question you cannot answer is worse than one you were
 * never asked: it reads as a product built for somebody else.
 *
 * Stated as **exclusions**, because the default has to be "show it". The cost
 * of the two mistakes is not symmetric — hiding a chip someone wanted forces
 * them onto "Other" and a text box, while showing a marginal one costs a
 * glance. So only the clearly-wrong rows are listed here, and everything not
 * named is offered to everyone. `final_exam` stays for a PhD (quals and
 * comprehensives are exams) and `university_project` for a postdoc (research
 * projects are the job) for exactly that reason.
 *
 * No key is added anywhere. `users.goal_key` and `users.major_key` carry CHECK
 * constraints generated from these same lists, and SQLite cannot alter a CHECK
 * in place — so a new key means a table-rebuild migration, while a narrower
 * *view* of the existing keys means nothing but this file.
 */

/** Goals that do not apply at a level. Everything unlisted is offered. */
const GOALS_EXCLUDED: Record<EducationLevelKey, readonly GoalKey[]> = {
  // No thesis, and no university coursework, before university.
  high_school: ['thesis', 'university_project'],
  // Foundation and college students are applying onward, so the tests stay.
  foundation: ['thesis'],
  // The SAT is a pre-university test; past foundation it is behind them.
  undergraduate: ['sat'],
  masters: ['sat'],
  phd: ['sat'],
  // A postdoc's thesis is done. Their projects are not.
  postdoc: ['sat', 'thesis'],
  // Graduated: no thesis, and no exams left to sit.
  recent_graduate: ['sat', 'thesis', 'final_exam'],
};

/**
 * Degree subjects that are not school subjects. Only high school is narrowed —
 * every other level is choosing or has chosen a real field, so the full list is
 * the right one.
 */
const SCHOOL_EXCLUDED: readonly MajorKey[] = [
  'software_engineering',
  'data_science',
  'medicine',
  'nursing',
  'pharmacy',
  'law',
  'finance',
  'marketing',
  'architecture',
  'agriculture',
  'education',
];

/**
 * Filters a canonical list without reordering it, and never drops something the
 * user has already chosen.
 *
 * That second rule is what makes changing your mind safe. Someone who answers
 * as an undergraduate, picks "Thesis", then goes back and switches to high
 * school would otherwise have that answer vanish from the screen while staying
 * in the draft — selected, invisible, and impossible to clear. Keeping it
 * visible lets them deselect it themselves.
 *
 * Filtering rather than appending, so the kept chip stays in its canonical
 * position instead of jumping to the end of the list.
 */
function narrow<T extends { key: string; label: string }>(
  list: readonly T[],
  excluded: readonly string[],
  keep: readonly string[],
): readonly T[] {
  const drop = new Set(excluded);
  const held = new Set(keep);
  return list.filter((option) => !drop.has(option.key) || held.has(option.key));
}

/**
 * The goals to offer at a level. `keep` is whatever is currently selected.
 *
 * An unknown or absent level returns the whole list: a deep link to
 * `/start/goal`, or a profile saved before levels existed, should show
 * everything rather than an arbitrary subset.
 */
export function goalsForLevel(
  level: string | null | undefined,
  keep: readonly string[] = [],
): readonly { key: GoalKey; label: string }[] {
  const excluded = level ? GOALS_EXCLUDED[level as EducationLevelKey] : undefined;
  return excluded ? narrow(GOALS, excluded, keep) : GOALS;
}

/** The subjects to offer at a level. See {@link goalsForLevel} for `keep`. */
export function majorsForLevel(
  level: string | null | undefined,
  keep: readonly string[] = [],
): readonly { key: MajorKey; label: string }[] {
  return level === 'high_school' ? narrow(MAJORS, SCHOOL_EXCLUDED, keep) : MAJORS;
}
