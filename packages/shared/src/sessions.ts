import { z } from 'zod';

import { localDateSchema, ulidSchema } from './schemas';

/**
 * Sessions (PRODUCT.md §3.1, slice 1): a clock with people around it.
 *
 * A solo session *is* the task clock the app already has — pressing Start on
 * a task with an estimate creates one — so nothing about that button changes.
 * A group session is the same clock shared: one start, everyone's presence
 * visible, chat locked for the people in it until it ends.
 *
 * Everything here is data and arithmetic both the API and the clients agree
 * on; the tables live in apps/api. None of the lists is CHECK-constrained in
 * the database (see 0009 in ARCHITECTURE.md for why): Zod is the gate.
 */

export const SESSION_KINDS = ['solo', 'group'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_STATES = ['scheduled', 'live', 'ended', 'cancelled'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const PARTICIPANT_STATES = [
  'committed',
  'present',
  'late',
  'no_show',
  'left_early',
  'completed',
] as const;
export type ParticipantState = (typeof PARTICIPANT_STATES)[number];

/** The three lengths the group screen offers. A custom length is allowed within the bounds. */
export const SESSION_LENGTHS = [25, 50, 90] as const;
export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 240;
export const MAX_BREAK_MINUTES = 15;

/**
 * Minutes are counted up to this multiple of the plan. A ninety-minute session
 * that runs to two hours earns two hours; one left running overnight does not
 * earn a night.
 */
export const SESSION_OVERRUN_FACTOR = 1.5;

/**
 * The economy (PRODUCT.md §3.6). Credits come from minutes on the clock, not
 * from ratings: a verified minute is worth one credit, an unverified one —
 * solo, or never reviewed — half. The bonus for every task of the day signed
 * off stays (`DAILY_COMPLETION_BONUS`), and a group session where everyone
 * stayed to the end pays each of them a cooperative bonus. Nothing is ever
 * deducted.
 */
export const CREDITS_PER_VERIFIED_MINUTE = 1;
export const UNVERIFIED_MINUTE_FACTOR = 0.5;
/** Minutes credited per local day, whatever the clocks say. */
export const DAILY_MINUTE_CREDIT_CAP = 240;
export const COOP_SESSION_BONUS = 20;

/** A day counts for the streak once this many minutes were on a clock. */
export const SESSION_STREAK_MINUTES = 25;

/** Forgiveness (PRODUCT.md §3.6). */
export const MAX_REST_DAYS_PER_WEEK = 2;
export const STREAK_FREEZES_PER_MONTH = 2;

/** Minutes a session earned between two instants, capped by its plan. */
export function sessionMinutes(startedAt: string, endedAt: string, plannedMinutes: number): number {
  const elapsed = Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);
  return Math.max(0, Math.min(elapsed, Math.floor(plannedMinutes * SESSION_OVERRUN_FACTOR)));
}

/** What unverified minutes are worth: half a credit each, whole credits only. */
export function unverifiedCredits(minutes: number): number {
  return Math.floor(minutes * UNVERIFIED_MINUTE_FACTOR);
}

/** The other half, paid when a reviewer confirms the work those minutes went into. */
export function verifiedTopUp(minutes: number): number {
  return Math.floor(minutes * CREDITS_PER_VERIFIED_MINUTE) - unverifiedCredits(minutes);
}

const minutesSchema = z.number().int().min(MIN_SESSION_MINUTES).max(MAX_SESSION_MINUTES);

/**
 * Starting or scheduling a group session. Without `scheduledFor` it is live the
 * moment it is created; with it, members commit and the host starts it.
 */
export const createSessionSchema = z.object({
  plannedMinutes: minutesSchema,
  breakMinutes: z.number().int().min(0).max(MAX_BREAK_MINUTES).default(0),
  scheduledFor: z.string().datetime().optional(),
  /** A task to bring: its clock starts with the session. */
  taskId: ulidSchema.optional(),
});

export const joinSessionSchema = z.object({
  taskId: ulidSchema.optional(),
});

/** Declaring a rest day (PRODUCT.md §3.6): today or later, never in arrears. */
export const restDaySchema = z.object({
  date: localDateSchema,
});
