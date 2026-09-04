import { describe, expect, it } from 'vitest';

import { MIN_AGE_YEARS, ageOn, isOldEnough, isPlausibleBirthDate } from '../src/index';
import { dateOfBirthSchema } from '../src/schemas';

/** A fixed "today" so these do not start failing on somebody's birthday. */
const TODAY = new Date(2026, 8, 2); // 2 September 2026, local.

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn('2000-09-02', TODAY)).toBe(26);
    expect(ageOn('2000-01-01', TODAY)).toBe(26);
  });

  it('does not round up before the birthday', () => {
    // One day short of sixteen is fifteen, which is the whole point.
    expect(ageOn('2010-09-03', TODAY)).toBe(15);
    expect(ageOn('2010-09-02', TODAY)).toBe(16);
  });

  it('handles a 29 February birthday without drifting', () => {
    // 2008 was a leap year; 2026 is not. Millisecond arithmetic divided by
    // 365.25 gets this one wrong.
    expect(ageOn('2008-02-29', new Date(2026, 1, 28))).toBe(17);
    expect(ageOn('2008-02-29', new Date(2026, 2, 1))).toBe(18);
  });

  it('rejects a date that is not a real day', () => {
    expect(ageOn('2010-02-30', TODAY)).toBeNull();
    expect(ageOn('2010-13-01', TODAY)).toBeNull();
    expect(ageOn('not-a-date', TODAY)).toBeNull();
    expect(ageOn('', TODAY)).toBeNull();
  });

  /**
   * `new Date('2010-05-04')` is UTC midnight, which reads as 3 May in every
   * timezone west of Greenwich. Parsing the parts out of the string is what
   * stops the floor moving by a day depending on where somebody is sitting.
   */
  it('does not shift by a day across timezones', () => {
    expect(ageOn('2010-09-02', new Date(2026, 8, 2, 0, 30))).toBe(16);
    expect(ageOn('2010-09-02', new Date(2026, 8, 2, 23, 30))).toBe(16);
  });
});

describe('the floor', () => {
  it('is 16', () => {
    expect(MIN_AGE_YEARS).toBe(16);
  });

  it('admits exactly sixteen and turns away a day younger', () => {
    expect(isOldEnough('2010-09-02', TODAY)).toBe(true);
    expect(isOldEnough('2010-09-03', TODAY)).toBe(false);
  });

  it('fails closed on anything it cannot parse', () => {
    for (const value of ['', 'yesterday', '2010-02-30', '10-09-2010']) {
      expect(isOldEnough(value, TODAY)).toBe(false);
    }
  });

  it('turns away a date in the future or an implausible one', () => {
    expect(isPlausibleBirthDate('2030-01-01', TODAY)).toBe(false);
    expect(isPlausibleBirthDate('1800-01-01', TODAY)).toBe(false);
    expect(isOldEnough('1800-01-01', TODAY)).toBe(false);
  });
});

describe('dateOfBirthSchema', () => {
  it('accepts somebody old enough', () => {
    expect(dateOfBirthSchema.safeParse('1998-04-11').success).toBe(true);
  });

  it('refuses somebody under the floor', () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - (MIN_AGE_YEARS - 1));
    const result = dateOfBirthSchema.safeParse(tooYoung.toISOString().slice(0, 10));
    expect(result.success).toBe(false);
  });

  it('refuses a malformed date rather than failing open', () => {
    for (const value of ['', '2010-2-3', '2010-02-30', '01/02/2010']) {
      expect(dateOfBirthSchema.safeParse(value).success).toBe(false);
    }
  });
});
