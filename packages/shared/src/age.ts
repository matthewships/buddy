/**
 * The minimum age, and the arithmetic that decides it (§2.8).
 *
 * **Why 16 rather than 13.** Thirteen is the floor US COPPA and UK GDPR set,
 * and it is what most consumer apps use. Buddy is not most consumer apps: it
 * matches *strangers*, gives them private chat, and since 2026-09-02 accepts
 * photographs from them. Sixteen clears every EU member state's Article 8
 * threshold without per-country consent logic, and matches Australia's
 * minimum-age regime for social platforms. It does **not** clear the UK's Age
 * Appropriate Design Code or Ofcom's children's duties, which cover everybody
 * under eighteen — this is a floor, not an exemption.
 *
 * One constant, read by the Zod schema, the API and the signup screen alike, so
 * moving the floor is moving this number.
 */
export const MIN_AGE_YEARS = 16;

/**
 * The oldest birth date worth accepting. Not a judgement about longevity — it
 * is the cheapest way to reject a mistyped year like `0202` as a typo rather
 * than storing it and computing an age of 1824.
 */
export const MAX_AGE_YEARS = 120;

/** `YYYY-MM-DD`, the same shape as a task's local date. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Age in whole years on a given day.
 *
 * Compared part by part rather than by subtracting milliseconds: a year is not
 * a fixed number of them, and dividing by 365.25 puts somebody born on 29
 * February on the wrong side of their own birthday. The parts come from the
 * string rather than from `Date`, because `new Date('2010-05-04')` is parsed as
 * UTC midnight and would read as the day before in every timezone west of
 * Greenwich — which is exactly the kind of bug that turns sixteen into fifteen
 * for a whole continent.
 */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number | null {
  if (!DATE_PATTERN.test(dateOfBirth)) return null;

  const [year, month, day] = dateOfBirth.split('-').map(Number) as [number, number, number];

  // Rejects 2026-02-31 and friends: `Date.UTC` rolls them over, so a round trip
  // that does not land on the same parts was never a real date.
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }

  // `on` is a real instant, so its *local* parts are the ones that match how a
  // person would answer "how old am I today".
  const nowYear = on.getFullYear();
  const nowMonth = on.getMonth() + 1;
  const nowDay = on.getDate();

  let age = nowYear - year;
  // Birthday not reached yet this year.
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1;
  return age;
}

/** Whether a birth date is a real one, in the past, and not absurd. */
export function isPlausibleBirthDate(dateOfBirth: string, on: Date = new Date()): boolean {
  const age = ageOn(dateOfBirth, on);
  return age !== null && age >= 0 && age <= MAX_AGE_YEARS;
}

/**
 * The gate. `false` for anything unparseable, so a malformed date can never
 * pass by failing open.
 */
export function isOldEnough(dateOfBirth: string, on: Date = new Date()): boolean {
  const age = ageOn(dateOfBirth, on);
  return age !== null && age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS;
}
