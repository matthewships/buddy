/**
 * Hobbies and interests — what someone does when they are not studying (§2.1).
 *
 * These are the warm, non-academic lines on a profile: the reason someone sends
 * a request to one of four equally-qualified buddies. Stored in `user_tags`
 * with `kind = 'interest'`.
 */
export const INTERESTS = [
  { key: 'reading', label: 'Reading' },
  { key: 'writing', label: 'Writing' },
  { key: 'gym', label: 'Gym' },
  { key: 'running', label: 'Running' },
  { key: 'football', label: 'Football' },
  { key: 'basketball', label: 'Basketball' },
  { key: 'swimming', label: 'Swimming' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'hiking', label: 'Hiking' },
  { key: 'yoga', label: 'Yoga' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'board_games', label: 'Board games' },
  { key: 'chess', label: 'Chess' },
  { key: 'music_listening', label: 'Music' },
  { key: 'playing_instrument', label: 'Playing an instrument' },
  { key: 'singing', label: 'Singing' },
  { key: 'dancing', label: 'Dancing' },
  { key: 'drawing', label: 'Drawing & painting' },
  { key: 'photography', label: 'Photography' },
  { key: 'film_making', label: 'Film making' },
  { key: 'cooking', label: 'Cooking' },
  { key: 'baking', label: 'Baking' },
  { key: 'coffee', label: 'Coffee' },
  { key: 'travel', label: 'Travelling' },
  { key: 'volunteering', label: 'Volunteering' },
  { key: 'coding_projects', label: 'Side projects' },
  { key: 'podcasts', label: 'Podcasts' },
  { key: 'anime', label: 'Anime & manga' },
  { key: 'fashion', label: 'Fashion' },
  { key: 'gardening', label: 'Gardening' },
  { key: 'pets', label: 'Pets' },
  { key: 'meditation', label: 'Meditation' },
] as const satisfies readonly { key: string; label: string }[];

export type InterestKey = (typeof INTERESTS)[number]['key'];

export const INTEREST_KEYS = INTERESTS.map((i) => i.key) as [InterestKey, ...InterestKey[]];

export function interestLabel(key: InterestKey): string {
  return INTERESTS.find((i) => i.key === key)!.label;
}
