import { describe, expect, it } from 'vitest';

import {
  COUNTRIES,
  COUNTRY_KEYS,
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_KEYS,
  INTERESTS,
  MAJORS,
  MAX_INTERESTS,
  MAX_TOPICS,
  OCCUPATION_KEYS,
  TOPICS,
  countryLabel,
  educationLevelLabel,
  normaliseInstitution,
  occupationForLevel,
} from '../src/index';
import { buddyDirectoryQuerySchema, majorSchema, updateMeSchema } from '../src/schemas';

/**
 * The lists are data the API validates against and the D1 CHECK constraints are
 * generated from, so a duplicate or a stray key is a migration-time failure
 * rather than a typo.
 */
describe('option lists', () => {
  const lists = { EDUCATION_LEVELS, MAJORS, TOPICS, INTERESTS, COUNTRIES };

  for (const [name, list] of Object.entries(lists)) {
    it(`${name} has unique, non-empty keys and labels`, () => {
      const keys = list.map((entry) => entry.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.every((key) => key.length > 0)).toBe(true);
      expect(list.every((entry) => entry.label.trim().length > 0)).toBe(true);
    });
  }

  it('offers a custom escape hatch only where free text is stored', () => {
    expect(MAJORS.some((m) => m.key === 'custom')).toBe(true);
    // Levels and countries are closed sets — there is no "other" country.
    expect(EDUCATION_LEVELS.some((l) => l.key === 'custom')).toBe(false);
    expect(COUNTRIES.some((c) => c.key === 'custom')).toBe(false);
  });

  it('uses ISO 3166-1 alpha-2 country codes', () => {
    expect(COUNTRY_KEYS.every((key) => /^[A-Z]{2}$/.test(key))).toBe(true);
    expect(countryLabel('GB')).toBe('United Kingdom');
  });

  it('labels every education level', () => {
    expect(EDUCATION_LEVEL_KEYS.map(educationLevelLabel).every(Boolean)).toBe(true);
  });
});

/**
 * The mobile app never sends `education_level` and still reads
 * `occupation_key`, so every level has to map onto a legacy occupation the
 * database will accept.
 */
describe('occupationForLevel', () => {
  it('maps every level onto a valid occupation key', () => {
    for (const level of EDUCATION_LEVEL_KEYS) {
      expect(OCCUPATION_KEYS).toContain(occupationForLevel(level));
    }
  });

  it('keeps postgraduates out of the undergraduate bucket', () => {
    expect(occupationForLevel('undergraduate')).toBe('student_undergrad');
    expect(occupationForLevel('masters')).toBe('student_grad');
    expect(occupationForLevel('phd')).toBe('student_grad');
    expect(occupationForLevel('recent_graduate')).toBe('job_seeker');
  });
});

/**
 * The directory's "same institution" filter and the match score both compare
 * normalised names. If these two ever disagreed the sort would rank someone the
 * filter had hidden, so the rules live here and are asserted, not assumed.
 */
describe('normaliseInstitution', () => {
  it('treats a dotted acronym as the acronym', () => {
    expect(normaliseInstitution('M.I.T.')).toBe(normaliseInstitution('MIT'));
    expect(normaliseInstitution('U.C.L.A.')).toBe(normaliseInstitution('ucla'));
  });

  it('folds case, accents and repeated whitespace', () => {
    expect(normaliseInstitution('École  Polytechnique')).toBe(
      normaliseInstitution('ecole polytechnique'),
    );
  });

  it('ignores a leading article, however the name is padded', () => {
    expect(normaliseInstitution('  The University of Toronto ')).toBe(
      normaliseInstitution('University of Toronto'),
    );
  });

  it('does not merge distinct schools', () => {
    expect(normaliseInstitution('Boston University')).not.toBe(
      normaliseInstitution('Boston College'),
    );
  });

  it('returns empty for blank input, so it never matches', () => {
    expect(normaliseInstitution('   ')).toBe('');
  });
});

describe('majorSchema', () => {
  it('requires text for a custom major', () => {
    expect(majorSchema.safeParse({ majorKey: 'custom' }).success).toBe(false);
    expect(majorSchema.safeParse({ majorKey: 'custom', majorText: 'Egyptology' }).success).toBe(
      true,
    );
  });

  it('accepts a listed major with no text', () => {
    expect(majorSchema.safeParse({ majorKey: 'law' }).success).toBe(true);
  });
});

describe('updateMeSchema — student fields', () => {
  it('accepts a full student profile', () => {
    const parsed = updateMeSchema.parse({
      educationLevel: 'undergraduate',
      institution: 'University of Toronto',
      city: 'Toronto',
      majorKey: 'computer_science',
      country: 'CA',
      bio: 'Second year, mostly nocturnal.',
      topics: ['ai', 'startups'],
      interests: ['running', 'coffee'],
    });
    expect(parsed.educationLevel).toBe('undergraduate');
    expect(parsed.topics).toEqual(['ai', 'startups']);
  });

  it('distinguishes clearing a field from leaving it alone', () => {
    expect(updateMeSchema.parse({ bio: null }).bio).toBeNull();
    expect('bio' in updateMeSchema.parse({ city: 'Leeds' })).toBe(false);
  });

  it('caps topics and interests', () => {
    const tooManyTopics = TOPICS.slice(0, MAX_TOPICS + 1).map((t) => t.key);
    const tooManyInterests = INTERESTS.slice(0, MAX_INTERESTS + 1).map((i) => i.key);
    expect(updateMeSchema.safeParse({ topics: tooManyTopics }).success).toBe(false);
    expect(updateMeSchema.safeParse({ interests: tooManyInterests }).success).toBe(false);
  });

  it('deduplicates repeated tags rather than counting them twice', () => {
    const parsed = updateMeSchema.parse({ topics: ['ai', 'ai', 'space'] });
    expect(parsed.topics).toEqual(['ai', 'space']);
  });

  it('rejects an unknown country or level', () => {
    expect(updateMeSchema.safeParse({ country: 'ZZ' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ educationLevel: 'kindergarten' }).success).toBe(false);
  });

  it('still requires text for a custom major', () => {
    expect(updateMeSchema.safeParse({ majorKey: 'custom' }).success).toBe(false);
    expect(
      updateMeSchema.safeParse({ majorKey: 'custom', majorText: 'Assyriology' }).success,
    ).toBe(true);
  });
});

describe('buddyDirectoryQuerySchema', () => {
  it('defaults to the recommended sort', () => {
    expect(buddyDirectoryQuerySchema.parse({}).sort).toBe('recommended');
  });

  it('accepts the points sort and the new filters', () => {
    const parsed = buddyDirectoryQuerySchema.parse({
      sort: 'points',
      level: 'masters',
      major: 'physics',
      country: 'DE',
      topic: 'space',
    });
    expect(parsed.sort).toBe('points');
    expect(parsed.level).toBe('masters');
  });

  it('reads query-string booleans as booleans', () => {
    expect(buddyDirectoryQuerySchema.parse({ sameInstitution: 'true' }).sameInstitution).toBe(true);
    expect(buddyDirectoryQuerySchema.parse({ sameInstitution: 'false' }).sameInstitution).toBe(
      false,
    );
  });

  it('rejects an unknown sort', () => {
    expect(buddyDirectoryQuerySchema.safeParse({ sort: 'newest' }).success).toBe(false);
  });
});
