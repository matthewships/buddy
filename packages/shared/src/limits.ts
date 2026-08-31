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

/**
 * Password hashing (§4.3).
 *
 * OWASP recommends 600,000 PBKDF2-SHA256 iterations, but the Workers runtime
 * refuses any single deriveBits call above 100,000:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 *   supported (requested 600000)
 *
 * Miniflare does not enforce that cap, so this only surfaces on a real deploy.
 *
 * The work factor is preserved by chaining: each round runs the platform
 * maximum and feeds its 32-byte output in as the next round's input, so an
 * attacker still has to perform ROUNDS x ITERATIONS_PER_ROUND sequential work.
 * The rounds cannot be parallelised because each depends on the previous one's
 * output, and the 256-bit intermediate makes collapse negligible.
 */
export const PBKDF2_ITERATIONS_PER_ROUND = 100_000;
export const PBKDF2_ROUNDS = 6;
/** The effective work factor, matching the OWASP figure. */
export const PBKDF2_TOTAL_ITERATIONS = PBKDF2_ITERATIONS_PER_ROUND * PBKDF2_ROUNDS;
/** The runtime's hard ceiling on a single deriveBits call. */
export const PBKDF2_MAX_ITERATIONS_PER_CALL = 100_000;
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
export const MAX_GOAL_TEXT = 200;
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

/** Student profile fields (§2.1). */
export const MAX_INSTITUTION = 80;
export const MAX_CITY = 60;
export const MAX_MAJOR_TEXT = 80;
export const MAX_BIO = 280;

/**
 * How many topics and interests a profile may carry.
 *
 * Small on purpose: these render as chips on a directory card, and a card that
 * lists a dozen of them stops being scannable — the same reasoning that caps
 * goals at two.
 */
export const MAX_TOPICS = 3;
export const MAX_INTERESTS = 5;

/** Pagination. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/**
 * Web Push subscription fields (§4.6). The endpoint is a URL chosen by the
 * browser's push service — FCM's are ~200 characters, Mozilla's ~100 — and the
 * two keys are fixed-size values the browser generates: a P-256 public point
 * (65 bytes) and a 16-byte auth secret, both base64url. The caps are generous
 * rather than exact so a push service lengthening its URLs cannot lock users
 * out of notifications.
 */
export const MAX_PUSH_ENDPOINT = 1000;
export const MAX_PUSH_KEY = 200;
