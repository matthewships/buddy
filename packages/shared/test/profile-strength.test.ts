import { describe, expect, it } from 'vitest';

import {
  PROFILE_FIELDS,
  PROFILE_STRENGTH_TOTAL,
  profileGaps,
  profileStrength,
  type ProfileStrengthInput,
} from '../src/index';

const empty: ProfileStrengthInput = {
  avatarKey: null,
  educationLevel: null,
  institution: null,
  majorKey: null,
  country: null,
  topics: [],
  interests: [],
  bio: null,
};

const full: ProfileStrengthInput = {
  avatarKey: 'avatars/u1/a.jpg',
  educationLevel: 'undergraduate',
  institution: 'University of Toronto',
  majorKey: 'computer_science',
  country: 'CA',
  topics: ['ai'],
  interests: ['climbing'],
  bio: 'Night owl.',
};

describe('profileStrength', () => {
  it('is 0 with nothing filled and 100 with everything', () => {
    expect(profileStrength(empty).score).toBe(0);
    expect(profileStrength(empty).filled).toBe(0);
    expect(profileStrength(full).score).toBe(100);
    expect(profileStrength(full).gaps).toEqual([]);
  });

  it('lists gaps heaviest first, in the directory’s own ranking order', () => {
    const gaps = profileGaps(empty);
    expect(gaps.map((g) => g.key)).toEqual(PROFILE_FIELDS.map((f) => f.key));
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1]!.weight).toBeGreaterThanOrEqual(gaps[i]!.weight);
    }
    // The match-score terms keep §2.2's weights, so the card's order is the
    // rank's order and not a second opinion about what matters.
    expect(gaps.find((g) => g.key === 'institution')?.weight).toBe(64);
    expect(gaps.find((g) => g.key === 'major')?.weight).toBe(32);
    expect(gaps.find((g) => g.key === 'level')?.weight).toBe(8);
    expect(gaps.find((g) => g.key === 'topics')?.weight).toBe(4);
    expect(gaps.find((g) => g.key === 'country')?.weight).toBe(2);
  });

  it('weights the score, so campus is worth more than a bio', () => {
    const withCampus = profileStrength({ ...empty, institution: 'MIT' });
    const withBio = profileStrength({ ...empty, bio: 'hi' });
    expect(withCampus.score).toBeGreaterThan(withBio.score);
    expect(withCampus.score).toBe(Math.round((64 / PROFILE_STRENGTH_TOTAL) * 100));
  });

  it('treats whitespace as empty', () => {
    expect(profileGaps({ ...full, institution: '   ' }).map((g) => g.key)).toEqual(['institution']);
    expect(profileGaps({ ...full, bio: '' }).map((g) => g.key)).toEqual(['bio']);
  });

  it('does not require the photo key to be present on the input', () => {
    const { avatarKey: _avatarKey, ...withoutPhoto } = full;
    expect(profileGaps(withoutPhoto).map((g) => g.key)).toEqual(['photo']);
  });
});
