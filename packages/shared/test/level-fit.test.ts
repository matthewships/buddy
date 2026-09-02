import { describe, expect, it } from 'vitest';

import {
  EDUCATION_LEVEL_KEYS,
  GOALS,
  MAJORS,
  goalsForLevel,
  majorsForLevel,
  occupationForLevel,
} from '../src/index';

const keys = (list: readonly { key: string }[]) => list.map((option) => option.key);

/**
 * The filters exist so nobody is asked a question they cannot answer. What
 * these tests actually protect is the other direction: that narrowing a list
 * never invents a key the database would reject, never empties a question, and
 * never swallows an answer somebody already gave.
 */
describe('goalsForLevel', () => {
  it('never offers a key outside the canonical list', () => {
    for (const level of EDUCATION_LEVEL_KEYS) {
      expect(keys(GOALS)).toEqual(expect.arrayContaining(keys(goalsForLevel(level))));
    }
  });

  it('keeps canonical order, so chips do not move between levels', () => {
    for (const level of EDUCATION_LEVEL_KEYS) {
      const offered = keys(goalsForLevel(level));
      expect(offered).toEqual(keys(GOALS).filter((key) => offered.includes(key)));
    }
  });

  it('leaves every level something to pick, and a way to say something else', () => {
    for (const level of EDUCATION_LEVEL_KEYS) {
      const offered = keys(goalsForLevel(level));
      expect(offered.length).toBeGreaterThan(3);
      expect(offered).toContain('custom');
    }
  });

  it('does not ask a school student about a thesis or a university project', () => {
    const offered = keys(goalsForLevel('high_school'));
    expect(offered).not.toContain('thesis');
    expect(offered).not.toContain('university_project');
    // The exams they *do* sit are still there.
    expect(offered).toContain('final_exam');
    expect(offered).toContain('sat');
  });

  it('drops the SAT once someone is past foundation', () => {
    expect(keys(goalsForLevel('foundation'))).toContain('sat');
    for (const level of ['undergraduate', 'masters', 'phd', 'postdoc', 'recent_graduate']) {
      expect(keys(goalsForLevel(level))).not.toContain('sat');
    }
  });

  it('stops offering a thesis to people who have finished one', () => {
    expect(keys(goalsForLevel('phd'))).toContain('thesis');
    expect(keys(goalsForLevel('postdoc'))).not.toContain('thesis');
    expect(keys(goalsForLevel('recent_graduate'))).not.toContain('thesis');
  });

  it('keeps exams for a PhD, whose quals are exams, and drops them once graduated', () => {
    expect(keys(goalsForLevel('phd'))).toContain('final_exam');
    expect(keys(goalsForLevel('recent_graduate'))).not.toContain('final_exam');
  });

  /**
   * The rule that makes changing your mind safe: switching level must never
   * hide an answer already given, or it becomes selected, invisible and
   * impossible to clear.
   */
  it('keeps an already-chosen goal visible after a change of level', () => {
    expect(keys(goalsForLevel('high_school'))).not.toContain('thesis');
    expect(keys(goalsForLevel('high_school', ['thesis']))).toContain('thesis');
  });

  it('puts a kept goal back in its canonical place, not at the end', () => {
    const offered = keys(goalsForLevel('high_school', ['thesis']));
    expect(offered.indexOf('thesis')).toBeLessThan(offered.indexOf('custom'));
  });

  it('offers everything when the level is unknown or unanswered', () => {
    expect(keys(goalsForLevel(null))).toEqual(keys(GOALS));
    expect(keys(goalsForLevel(undefined))).toEqual(keys(GOALS));
    expect(keys(goalsForLevel('not_a_level'))).toEqual(keys(GOALS));
  });
});

describe('majorsForLevel', () => {
  it('narrows school to subjects that exist at school', () => {
    const offered = keys(majorsForLevel('high_school'));
    for (const degree of ['medicine', 'nursing', 'pharmacy', 'law', 'architecture']) {
      expect(offered).not.toContain(degree);
    }
    for (const subject of ['mathematics', 'physics', 'history', 'art', 'undecided', 'custom']) {
      expect(offered).toContain(subject);
    }
  });

  it('narrows middle school exactly as it narrows high school', () => {
    expect(keys(majorsForLevel('middle_school'))).toEqual(keys(majorsForLevel('high_school')));
  });

  it('offers the school subjects at both school levels', () => {
    // The three that were missing outright until 2026-09-02: narrowing a list
    // cannot produce a row it never had.
    for (const level of ['middle_school', 'high_school'] as const) {
      const offered = keys(majorsForLevel(level));
      for (const subject of ['geography', 'religious_studies', 'drama']) {
        expect(offered).toContain(subject);
      }
    }
  });

  it('leaves every level past school the full list', () => {
    const atSchool: string[] = ['middle_school', 'high_school'];
    for (const level of EDUCATION_LEVEL_KEYS.filter((key) => !atSchool.includes(key))) {
      expect(keys(majorsForLevel(level))).toEqual(keys(MAJORS));
    }
    expect(keys(majorsForLevel(null))).toEqual(keys(MAJORS));
  });

  it('keeps a subject chosen at another level visible', () => {
    expect(keys(majorsForLevel('high_school'))).not.toContain('law');
    expect(keys(majorsForLevel('high_school', ['law']))).toContain('law');
  });

  it('never offers a key outside the canonical list', () => {
    for (const level of EDUCATION_LEVEL_KEYS) {
      expect(keys(MAJORS)).toEqual(expect.arrayContaining(keys(majorsForLevel(level))));
    }
  });
});

describe('middle school', () => {
  it('is the youngest level and comes first', () => {
    expect(EDUCATION_LEVEL_KEYS[0]).toBe('middle_school');
  });

  it('is not offered the SAT, a thesis, university work or a job hunt', () => {
    const offered = goalsForLevel('middle_school').map((goal) => goal.key);
    for (const goal of ['sat', 'thesis', 'university_project', 'job_hunting']) {
      expect(offered).not.toContain(goal);
    }
    // But the things a thirteen-year-old plausibly is doing stay.
    for (const goal of ['final_exam', 'language', 'reading', 'coding', 'custom']) {
      expect(offered).toContain(goal);
    }
  });

  it('maps to the closest occupation the legacy CHECK already allows', () => {
    expect(occupationForLevel('middle_school')).toBe('student_high_school');
  });
});
