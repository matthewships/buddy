import { z } from 'zod';

import { ulidSchema } from './schemas';

/**
 * Pressure (PRODUCT.md §3.3, slice 2): the three nudges, the check-in a
 * person asks for, the budget that keeps all of it healthy, and the
 * reliability score that carries the pressure instead of credits.
 *
 * Nudges are templated, never free text: nagging needs free text and volume,
 * and this removes both. The templates are data, like `STATUSES`, so editing
 * one is a config change.
 */

/** What a groupmate can say to somebody who has not started. One tap, no typing. */
export const NUDGE_TEMPLATES = [
  { key: 'waiting', text: 'Waiting for you' },
  { key: 'got_this', text: 'You’ve got this' },
  { key: 'without_you', text: 'Starting without you — come when you can' },
  { key: 'ok', text: 'Everything ok?' },
] as const;
export type NudgeTemplateKey = (typeof NUDGE_TEMPLATES)[number]['key'];
export const NUDGE_TEMPLATE_KEYS = NUDGE_TEMPLATES.map((t) => t.key) as [
  NudgeTemplateKey,
  ...NudgeTemplateKey[],
];

/** What the buddy who was asked to check in can send back, one tap. */
export const CHECKIN_REPLIES = [
  { key: 'checking', text: 'Checking in — how’s it going?' },
  { key: 'still_at_it', text: 'Still at it? Proud of you.' },
  { key: 'need_anything', text: 'Need anything from me?' },
] as const;
export type CheckinReplyKey = (typeof CHECKIN_REPLIES)[number]['key'];
export const CHECKIN_REPLY_KEYS = CHECKIN_REPLIES.map((t) => t.key) as [
  CheckinReplyKey,
  ...CheckinReplyKey[],
];

export function nudgeText(key: string): string {
  return (
    NUDGE_TEMPLATES.find((t) => t.key === key)?.text ??
    CHECKIN_REPLIES.find((t) => t.key === key)?.text ??
    key
  );
}

/**
 * The budget (PRODUCT.md §5.3), per recipient, per local day, across every
 * group. Three nudges from people and two requested check-ins is enough to
 * be reached; more is enough to be hounded.
 */
export const MAX_BUDDY_NUDGES_PER_DAY = 3;
export const MAX_CHECKINS_PER_DAY = 2;

/** The system nudge fires this long before the latest start (PRODUCT.md §3.1). */
export const START_NUDGE_LEAD_MINUTES = 30;

/** Group sessions: late after five minutes, absent after ten. Focusmate's thresholds. */
export const LATE_AFTER_MINUTES = 5;
export const NO_SHOW_AFTER_MINUTES = 10;

/**
 * Reliability (PRODUCT.md §3.6): on-time attendance over the last
 * `RELIABILITY_WINDOW` group sessions somebody committed to. Shown as a band;
 * the exact number only to its owner. Below `RELIABILITY_SUSPEND_BELOW`,
 * once there are enough sessions to judge, instant matching pauses.
 */
export const RELIABILITY_WINDOW = 20;
export const RELIABILITY_SUSPEND_BELOW = 70;
export const RELIABILITY_MIN_SESSIONS = 5;

export type ReliabilityBand = 'reliable' | 'mostly' | 'rebuilding' | 'new';

export function reliabilityBand(percent: number | null, sessions: number): ReliabilityBand {
  if (percent === null || sessions < RELIABILITY_MIN_SESSIONS) return 'new';
  if (percent >= 85) return 'reliable';
  if (percent >= RELIABILITY_SUSPEND_BELOW) return 'mostly';
  return 'rebuilding';
}

export const RELIABILITY_BAND_LABEL: Record<ReliabilityBand, string> = {
  reliable: 'Shows up',
  mostly: 'Mostly shows up',
  rebuilding: 'Rebuilding',
  new: 'New here',
};

/** `HH:MM`, the owner's own "start by" on a task's local day. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const nudgeTaskSchema = z.object({
  template: z.enum(NUDGE_TEMPLATE_KEYS),
});

export const requestCheckinSchema = z.object({
  buddyUserId: ulidSchema,
  /** When to check, as an instant. Today, and in the future. */
  at: z.string().datetime(),
});

export const replyCheckinSchema = z.object({
  template: z.enum(CHECKIN_REPLY_KEYS),
});
