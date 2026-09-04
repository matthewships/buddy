/**
 * How findable a profile is, and what would make it more so (§2.9).
 *
 * Signup stopped asking for country, topics, interests and a bio on
 * 2026-09-03, and it never asked for a photo. Those answers still matter — two
 * of the things it *does* still ask, institution and field, are the 64- and
 * 32-point terms of the directory's match score (§2.2), and someone who
 * skipped them ranks below almost everyone for the people most like them. So
 * the questions are asked again, later, on the screen where their answer
 * changes something: the buddy directory, and the profile.
 *
 * This is the LinkedIn profile-strength meter, with one difference: the
 * weights are not made up. Where a field is a match term its weight *is* the
 * match term, so the order the gaps are shown in is the order they would
 * change somebody's rank. The fields that are not match terms — a photo, a
 * bio — carry weights chosen against that scale, and say why.
 *
 * Pure, and shared, so the web's card and any future mobile one agree on what
 * "complete" means.
 */
export interface ProfileStrengthInput {
  avatarKey?: string | null;
  educationLevel: string | null;
  institution: string | null;
  majorKey: string | null;
  country: string | null;
  topics: readonly string[];
  interests: readonly string[];
  bio: string | null;
}

export interface ProfileGap {
  key: string;
  /** What to add, as a button label would say it. */
  label: string;
  /** Why it is worth adding, in the directory's own terms. */
  why: string;
  weight: number;
}

const filled = (value: string | null | undefined) => Boolean(value && value.trim().length > 0);

/**
 * Heaviest first. The first four weights are lifted straight from §2.2's
 * ranking (`sameInstitution` 64, `sameMajor` 32, `sameLevel` 8, `sharedTopic`
 * 4, `sameCountry` 2). The photo sits between field and level because it does
 * not rank anyone but it decides who gets the tap; interests and the bio are
 * the tiebreak and the voice, and weigh what a tiebreak weighs.
 */
export const PROFILE_FIELDS: readonly (ProfileGap & {
  has: (profile: ProfileStrengthInput) => boolean;
})[] = [
  {
    key: 'institution',
    label: 'Add where you study',
    why: 'Campus is the heaviest match after your goal. People from your university rank you above almost everyone.',
    weight: 64,
    has: (p) => filled(p.institution),
  },
  {
    key: 'major',
    label: 'Add your field',
    why: 'Field of study is the next-heaviest match, and the first thing a card says under your name.',
    weight: 32,
    has: (p) => filled(p.majorKey),
  },
  {
    key: 'photo',
    label: 'Add a photo',
    why: 'A face gets picked over a circle. It does not change your rank; it changes who gets the tap.',
    weight: 16,
    has: (p) => filled(p.avatarKey),
  },
  {
    key: 'level',
    label: 'Add your level of study',
    why: 'Level is what a card leads with, and a small match term.',
    weight: 8,
    has: (p) => filled(p.educationLevel),
  },
  {
    key: 'topics',
    label: 'Pick a few topics',
    why: 'A shared topic is a tiebreak in the ranking — and a reason for somebody to open the chat.',
    weight: 4,
    has: (p) => p.topics.length > 0,
  },
  {
    key: 'interests',
    label: 'Say what you do for fun',
    why: 'The warm line on a card. When four people match equally on paper, this is what decides.',
    weight: 4,
    has: (p) => p.interests.length > 0,
  },
  {
    key: 'country',
    label: 'Add where you are from',
    why: 'A small match term, and often the first thing two strangers find they have in common.',
    weight: 2,
    has: (p) => filled(p.country),
  },
  {
    key: 'bio',
    label: 'Write a line about yourself',
    why: 'Everything else on your profile is a category. This is the part that sounds like you.',
    weight: 2,
    has: (p) => filled(p.bio),
  },
];

export const PROFILE_STRENGTH_TOTAL = PROFILE_FIELDS.reduce((sum, f) => sum + f.weight, 0);

/** What is missing, heaviest first — the order `PROFILE_FIELDS` is written in. */
export function profileGaps(profile: ProfileStrengthInput): ProfileGap[] {
  return PROFILE_FIELDS.filter((f) => !f.has(profile)).map(({ has: _has, ...gap }) => gap);
}

export interface ProfileStrength {
  /** 0–100, the weighted share of fields that are filled. */
  score: number;
  /** Out of `PROFILE_FIELDS.length`, for a segmented bar. */
  filled: number;
  gaps: ProfileGap[];
}

export function profileStrength(profile: ProfileStrengthInput): ProfileStrength {
  const gaps = profileGaps(profile);
  const missing = gaps.reduce((sum, g) => sum + g.weight, 0);
  return {
    score: Math.round(((PROFILE_STRENGTH_TOTAL - missing) / PROFILE_STRENGTH_TOTAL) * 100),
    filled: PROFILE_FIELDS.length - gaps.length,
    gaps,
  };
}
