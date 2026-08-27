/**
 * Timing, rate limits and size caps (§2.2, §4.3, §4.5).
 */

/** Buddy requests expire this long after they are sent (§2.2). */
export const BUDDY_REQUEST_TTL_MS = 5 * 60 * 1000;

/** After a decline or timeout, the same person can be re-requested only after this long. */
export const BUDDY_REQUEST_COOLDOWN_MS = 60 * 60 * 1000;

/** Group invites are for people you already know, so they last far longer. */
export const GROUP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A user counts as "active now" if seen within this window. */
export const ACTIVE_NOW_MS = 15 * 60 * 1000;

/** `last_seen_at` is bumped at most this often, to keep writes cheap. */
export const LAST_SEEN_THROTTLE_MS = 60 * 1000;

/** Auth token lifetimes (§4.3). */
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Email verification / password reset codes (§4.3). */
export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

/** Password hashing — OWASP parameters for PBKDF2-SHA256 (§4.3). */
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_BYTES = 16;
export const PBKDF2_KEY_BYTES = 32;

/** Password policy. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** The WebSocket ticket issued by REST before a chat connection (§4.7). */
export const CHAT_TICKET_TTL_MS = 60 * 1000;

/** Rate limits, expressed as (requests, window). */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  resendCode: { limit: 3, windowMs: 10 * 60 * 1000 },
  buddyRequest: { limit: 20, windowMs: 60 * 60 * 1000 },
  report: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const;

/** Field length caps, mirrored by the Zod schemas. */
export const MAX_DISPLAY_NAME = 40;
export const MAX_HANDLE = 24;
export const MIN_HANDLE = 3;
export const MAX_GOAL_TEXT = 120;
export const MAX_OCCUPATION_TEXT = 120;
export const MAX_HEADLINE = 80;
export const MAX_ABOUT = 600;
export const MAX_AVAILABILITY = 80;
export const MAX_CHECKIN_STYLE = 120;
export const MAX_TASK_TITLE = 140;
export const MAX_TASK_NOTES = 600;
export const MAX_PROOF_TEXT = 1000;
export const MAX_MESSAGE_BODY = 2000;
export const MAX_REVIEW_COMMENT = 500;
export const MAX_REQUEST_MESSAGE = 200;
export const MAX_REPORT_NOTE = 600;

/** Pagination. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
