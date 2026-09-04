/**
 * The reactions a Feed post can receive (§2.7).
 *
 * A fixed, closed, positive set — there is no thumbs-down and no free-text
 * emoji. That is the whole design: the Feed is the one surface in Buddy that is
 * not about being marked, and a product built on other people rating your work
 * should not also hand them a way to boo. A closed list also means the column is
 * CHECK-constrained rather than holding arbitrary user input.
 */
export const REACTIONS = [
  { key: 'heart', emoji: '❤️', label: 'Love' },
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'clap', emoji: '👏', label: 'Respect' },
  { key: 'book', emoji: '📚', label: 'Studying' },
  { key: 'brain', emoji: '🧠', label: 'Smart' },
] as const satisfies readonly { key: string; emoji: string; label: string }[];

export type ReactionKey = (typeof REACTIONS)[number]['key'];

export const REACTION_KEYS = REACTIONS.map((r) => r.key) as [ReactionKey, ...ReactionKey[]];

export function reactionEmoji(key: ReactionKey): string {
  return REACTIONS.find((r) => r.key === key)!.emoji;
}
