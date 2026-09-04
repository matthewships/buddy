/**
 * Today's status (§2.6) — the one line a groupmate reads before deciding
 * whether to say anything.
 *
 * **Verbs, not feelings.** The obvious version of this feature is a mood
 * picker, and a mood is a dead end: "😔" tells a groupmate that something is
 * wrong and gives them nothing to do about it. The job here is not
 * self-expression, it is handing the other four people in a group a reason to
 * open the chat. So every option names what is happening to the work, and
 * carries the opening line it invites.
 *
 * **It expires by itself, at local midnight.** A status is about today; one
 * left up for a week is worse than none, because it is read as current. The
 * stored value carries the local day it was set for and is simply not shown on
 * any other day — the same lazy expiry the invites and buddy requests use, with
 * no cron and nothing to clean up.
 */
export interface Status {
  key: string;
  /** What the person is doing, in their own voice. */
  label: string;
  emoji: string;
  /** What it asks of everybody else. Shown to groupmates, not to the setter. */
  invites: string;
}

export const STATUSES = [
  {
    key: 'heads_down',
    label: 'Heads down',
    emoji: '🎯',
    invites: 'Leave them to it.',
  },
  {
    key: 'on_a_roll',
    label: 'On a roll',
    emoji: '🚀',
    invites: 'Tell them it shows.',
  },
  {
    key: 'slow_start',
    label: 'Slow start',
    emoji: '🐌',
    invites: 'Ask what the first small thing could be.',
  },
  {
    key: 'stuck',
    label: 'Stuck',
    emoji: '🧱',
    invites: 'Ask what it is stuck on.',
  },
  {
    key: 'need_a_push',
    label: 'Need a push',
    emoji: '🙏',
    invites: 'This one is an ask. Send something.',
  },
  {
    key: 'catching_up',
    label: 'Catching up',
    emoji: '📚',
    invites: 'Check in tonight rather than now.',
  },
  {
    key: 'day_off',
    label: 'Taking today off',
    emoji: '🌤️',
    invites: 'Nothing needed. Do not count it against them.',
  },
] as const satisfies readonly Status[];

export type StatusKey = (typeof STATUSES)[number]['key'];

export const STATUS_KEYS = STATUSES.map((s) => s.key) as [StatusKey, ...StatusKey[]];

/**
 * A stored key's definition, or `null` if the key is no longer offered.
 *
 * Tolerated rather than thrown, for the same reason `describeBadge` tolerates a
 * retired badge: removing an option from this list must not break the group
 * screen of everybody who happened to have it set.
 */
export function status(key: string): Status | null {
  return STATUSES.find((s) => s.key === key) ?? null;
}

/**
 * Whether a stored status still belongs to the day it was set for.
 *
 * `statusDate` is the setter's own local day, and `localToday` must be their
 * local day too — a group has members in several timezones, and a status set in
 * Tokyo is stale by London's calendar hours before it is stale by its owner's.
 */
export function statusIsCurrent(
  statusDate: string | null | undefined,
  localToday: string,
): boolean {
  return Boolean(statusDate) && statusDate === localToday;
}
