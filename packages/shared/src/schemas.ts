import { z } from 'zod';

import { COUNTRY_KEYS } from './countries';
import { REACTION_KEYS } from './reactions';
import { EDUCATION_LEVEL_KEYS } from './education-levels';
import { GOAL_KEYS } from './goals';
import { INTEREST_KEYS } from './interests';
import { MAJOR_KEYS } from './majors';
import { OCCUPATION_KEYS } from './occupations';
import { STATUS_KEYS } from './statuses';
import { TOPIC_KEYS } from './topics';
import { MAX_RATING, MIN_RATING } from './credits';
import {
  DEFAULT_PAGE_SIZE,
  EMAIL_CODE_LENGTH,
  MAX_ABOUT,
  MAX_AVAILABILITY,
  MAX_BIO,
  MAX_CHECKIN_STYLE,
  MAX_CITY,
  MAX_DISPLAY_NAME,
  MAX_GOAL_TEXT,
  MAX_HANDLE,
  MAX_HEADLINE,
  MAX_INSTITUTION,
  MAX_INTERESTS,
  MAX_INTEREST_TEXT,
  MAX_MAJOR_TEXT,
  MAX_MESSAGE_BODY,
  MAX_OCCUPATION_TEXT,
  MAX_INVITE_TOKEN,
  MAX_PAGE_SIZE,
  MAX_POST_CAPTION,
  MAX_REPLY_TEXT,
  MAX_PROOF_TEXT,
  MAX_PUSH_ENDPOINT,
  MAX_PUSH_KEY,
  MAX_REPORT_NOTE,
  MAX_REQUEST_MESSAGE,
  MAX_REVIEW_COMMENT,
  MAX_TASK_MINUTES,
  MAX_TASK_NOTES,
  MAX_TASK_TITLE,
  MAX_TOPICS,
  MIN_HANDLE,
  MIN_TASK_MINUTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './limits';
import {
  EMAIL_CODE_PURPOSES,
  LEADERBOARD_SCOPES,
  PLATFORMS,
  REPORT_TARGETS,
  REVIEW_ACTIONS,
} from './enums';

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** Emails are compared and stored lowercase, so normalise on the way in. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

/** Handles are the public identifier: lowercase letters, digits, underscore. */
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(MIN_HANDLE)
  .max(MAX_HANDLE)
  .regex(/^[a-z0-9_]+$/, 'Use letters, numbers and underscores only');

export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME);

export const emailCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`), `Enter the ${EMAIL_CODE_LENGTH}-digit code`);

/** An IANA timezone name, e.g. "Asia/Muscat". Validated against the runtime's tz database. */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone');

/** A local calendar day, YYYY-MM-DD — the unit a task is planned for. */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const ulidSchema = z
  .string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Expected a ULID');

export const cursorSchema = z.string().min(1).max(200);

export const paginationSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/* ------------------------------------------------------------------ *
 * Auth (§4.3)
 * ------------------------------------------------------------------ */

/**
 * The web client asks for the handle on the register screen, because it is
 * unique-checked server-side and that only means anything once an account is
 * being created. It stays **optional** so the mobile app, which still claims a
 * handle later during onboarding, keeps working unchanged.
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  handle: handleSchema.optional(),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
});

export const resendCodeSchema = z.object({
  email: emailSchema,
  purpose: z.enum(EMAIL_CODE_PURPOSES).default('verify'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

/* ------------------------------------------------------------------ *
 * Profile & onboarding (§2.1)
 * ------------------------------------------------------------------ */

/**
 * The whole ordered list of goals, as the signup picker now collects it.
 *
 * Deduplicated, and bounded by construction rather than by a cap: the enum has
 * twelve members, so "as many as you like" cannot grow without bound. Order is
 * meaning — the first pick is the primary goal, and the server derives
 * `goalKey`/`goalKey2` from the first two.
 */
export const goalKeysSchema = z
  .array(z.enum(GOAL_KEYS))
  .transform((v) => [...new Set(v)]);

/**
 * Goal and occupation are each a key plus free text. When the key is `custom`
 * the text is what the user typed and is required; otherwise the text is an
 * optional elaboration (field of study, job title, which exam).
 */
export const goalSchema = z
  .object({
    goalKey: z.enum(GOAL_KEYS),
    /**
     * The second indexed goal. Kept as its own field rather than only living in
     * `goalKeys`: `goal_key` and `goal_key_2` are indexed, carry CHECK
     * constraints and are what matching and the mobile app read, so they stay
     * the primary pair. `goalKeys` carries the rest.
     */
    goalKey2: z.enum(GOAL_KEYS).nullish(),
    goalKeys: goalKeysSchema.optional(),
    goalText: z.string().trim().max(MAX_GOAL_TEXT).optional(),
  })
  .refine(
    (v) => !(v.goalKey === 'custom' || v.goalKeys?.includes('custom')) || (v.goalText?.length ?? 0) > 0,
    { message: 'Describe your goal', path: ['goalText'] },
  )
  .refine((v) => !v.goalKey2 || v.goalKey2 !== v.goalKey, {
    message: 'Pick two different goals',
    path: ['goalKey2'],
  });

export const occupationSchema = z
  .object({
    occupationKey: z.enum(OCCUPATION_KEYS),
    occupationText: z.string().trim().max(MAX_OCCUPATION_TEXT).optional(),
  })
  .refine((v) => v.occupationKey !== 'custom' || (v.occupationText?.length ?? 0) > 0, {
    message: 'Describe what you do',
    path: ['occupationText'],
  });

/**
 * Field of study, the same key-plus-text pair as goals and occupations: the
 * text is required when the key is `custom` and an optional elaboration
 * otherwise ("Joint honours", a specialisation).
 */
export const majorSchema = z
  .object({
    majorKey: z.enum(MAJOR_KEYS),
    majorText: z.string().trim().max(MAX_MAJOR_TEXT).optional(),
  })
  .refine((v) => v.majorKey !== 'custom' || (v.majorText?.length ?? 0) > 0, {
    message: 'Tell us what you study',
    path: ['majorText'],
  });

export const buddyProfileSchema = z.object({
  headline: z.string().trim().max(MAX_HEADLINE).optional(),
  about: z.string().trim().max(MAX_ABOUT).optional(),
  availability: z.string().trim().max(MAX_AVAILABILITY).optional(),
  checkinStyle: z.string().trim().max(MAX_CHECKIN_STYLE).optional(),
});

/**
 * PATCH /me. Every field is optional — the client sends only what changed —
 * but the `custom` rule above still has to hold, so goal and occupation are
 * validated as pairs when either half is present.
 */
export const updateMeSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    handle: handleSchema.optional(),
    timezone: timezoneSchema.optional(),
    avatarKey: z.string().max(200).nullish(),
    isOpenBuddy: z.boolean().optional(),
    goalKey: z.enum(GOAL_KEYS).optional(),
    goalKey2: z.enum(GOAL_KEYS).nullish(),
    /**
     * The full ordered list, which signup now sends instead of a pair. The
     * route derives `goalKey`/`goalKey2` from its first two, so a client may
     * send this alone; a client that knows only the pair (the mobile app) keeps
     * sending the pair and the route derives the list from it instead.
     */
    goalKeys: goalKeysSchema.optional(),
    goalText: z.string().trim().max(MAX_GOAL_TEXT).nullish(),
    /**
     * Still accepted, but signup no longer asks: the route derives it from
     * `educationLevel` when one is sent. Kept in the schema because the mobile
     * app still sends it.
     */
    occupationKey: z.enum(OCCUPATION_KEYS).optional(),
    occupationText: z.string().trim().max(MAX_OCCUPATION_TEXT).nullish(),
    /* Student profile (§2.1). All nullish: clearing a field is a real edit, and
       an omitted field must stay untouched, so null and undefined differ. */
    educationLevel: z.enum(EDUCATION_LEVEL_KEYS).nullish(),
    institution: z.string().trim().max(MAX_INSTITUTION).nullish(),
    city: z.string().trim().max(MAX_CITY).nullish(),
    majorKey: z.enum(MAJOR_KEYS).nullish(),
    majorText: z.string().trim().max(MAX_MAJOR_TEXT).nullish(),
    country: z.enum(COUNTRY_KEYS).nullish(),
    bio: z.string().trim().max(MAX_BIO).nullish(),
    /* Replace-a-set semantics: sending the array replaces every tag of that
       kind, omitting it leaves them alone. Deduplicated so a client that sends
       the same chip twice cannot inflate the count past the cap. */
    topics: z
      .array(z.enum(TOPIC_KEYS))
      .max(MAX_TOPICS)
      .transform((v) => [...new Set(v)])
      .optional(),
    interests: z
      .array(z.enum(INTEREST_KEYS))
      .max(MAX_INTERESTS)
      .transform((v) => [...new Set(v)])
      .optional(),
    /** What `custom` means, when it is one of the interests (§2.1). */
    interestText: z.string().trim().max(MAX_INTEREST_TEXT).nullish(),
    buddyProfile: buddyProfileSchema.optional(),
  })
  .refine(
    (v) => !(v.goalKey === 'custom' || v.goalKeys?.includes('custom')) || (v.goalText?.length ?? 0) > 0,
    { message: 'Describe your goal', path: ['goalText'] },
  )
  /**
   * The same rule for the `Other` hobby. Only checked when `interests` is
   * present: a patch that touches nothing else must not be rejected for a
   * `custom` the user chose long ago and still has stored text for.
   */
  .refine((v) => !v.interests?.includes('custom') || (v.interestText?.trim().length ?? 0) > 0, {
    message: 'Say what that hobby is',
    path: ['interestText'],
  })
  // Only meaningful when both halves are present; a patch that sends just
  // goalKey2 cannot see the stored goalKey, so the route re-checks it (§2.1).
  .refine((v) => !v.goalKey2 || !v.goalKey || v.goalKey2 !== v.goalKey, {
    message: 'Pick two different goals',
    path: ['goalKey2'],
  })
  .refine((v) => v.occupationKey !== 'custom' || (v.occupationText?.length ?? 0) > 0, {
    message: 'Describe what you do',
    path: ['occupationText'],
  })
  .refine((v) => v.majorKey !== 'custom' || (v.majorText?.length ?? 0) > 0, {
    message: 'Tell us what you study',
    path: ['majorText'],
  });

export const registerDeviceSchema = z.object({
  expoPushToken: z.string().min(1).max(200),
  platform: z.enum(PLATFORMS),
});

/**
 * A browser's Web Push subscription (§4.6), shaped exactly like the JSON that
 * `PushSubscription.toJSON()` produces, so the client can post it unmodified.
 *
 * `expirationTime` is part of that JSON and is deliberately not accepted: it is
 * null in every browser that ships today, and the server learns a subscription
 * is dead the only way that is reliable — a 404 or 410 from the push service.
 */
export const webPushSubscriptionSchema = z.object({
  endpoint: z.url().max(MAX_PUSH_ENDPOINT),
  keys: z.object({
    /** The subscription's P-256 public key, base64url, uncompressed point. */
    p256dh: z.string().min(1).max(MAX_PUSH_KEY),
    /** The 16-byte shared auth secret, base64url. */
    auth: z.string().min(1).max(MAX_PUSH_KEY),
  }),
});

export const unsubscribeWebPushSchema = z.object({
  endpoint: z.url().max(MAX_PUSH_ENDPOINT),
});

/* ------------------------------------------------------------------ *
 * Buddies & requests (§2.2)
 * ------------------------------------------------------------------ */

/** Query-string booleans arrive as the strings "true"/"false". */
const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true')
  .optional();

export const BUDDY_SORTS = ['recommended', 'points'] as const;
export type BuddySort = (typeof BUDDY_SORTS)[number];

export const buddyDirectoryQuerySchema = paginationSchema.extend({
  sort: z.enum(BUDDY_SORTS).default('recommended'),
  goal: z.enum(GOAL_KEYS).optional(),
  occupation: z.enum(OCCUPATION_KEYS).optional(),
  level: z.enum(EDUCATION_LEVEL_KEYS).optional(),
  major: z.enum(MAJOR_KEYS).optional(),
  country: z.enum(COUNTRY_KEYS).optional(),
  topic: z.enum(TOPIC_KEYS).optional(),
  /**
   * Institution is free text, so there is no list to filter by — the only
   * question a chip could answer is "the same one as me", which is this.
   */
  sameInstitution: queryBoolean,
  activeOnly: queryBoolean,
});

export const createBuddyRequestSchema = z.object({
  toUserId: ulidSchema,
  message: z.string().trim().max(MAX_REQUEST_MESSAGE).optional(),
});

/* ------------------------------------------------------------------ *
 * Groups & invites (§2.3)
 * ------------------------------------------------------------------ */

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  emoji: z.string().trim().max(8).optional(),
});

export const inviteToGroupSchema = z.object({
  handle: handleSchema,
});

/**
 * Naming the group's Buddy, and the member who verifies the Buddy's own tasks
 * (§2.4). Both nullable: clearing the Buddy is a real action, and returns the
 * group to the any-member review rule.
 */
export const setGroupBuddySchema = z.object({
  buddyUserId: ulidSchema.nullable(),
  verifierUserId: ulidSchema.nullish(),
});

/** An invite-link token, as it appears in a URL. */
export const inviteTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(MAX_INVITE_TOKEN)
  .regex(/^[A-Za-z0-9_-]+$/, 'Not a valid invite link');

/* ------------------------------------------------------------------ *
 * Feed (§2.7)
 * ------------------------------------------------------------------ */

/**
 * A post is a photo, a few words, or both — but not nothing.
 *
 * The photo used to be required, which made the Feed a place you could only
 * reach with a camera. Plenty of what people want to say about a day ("finally
 * finished chapter four") has no picture, and refusing it turned those into
 * nothing at all.
 *
 * The refine is what keeps a post from being empty, and it tests the *trimmed*
 * caption: a post of three spaces is not a post.
 */
export const createPostSchema = z
  .object({
    imageKey: z.string().min(1).max(200).optional(),
    caption: z.string().trim().max(MAX_POST_CAPTION).optional(),
  })
  .refine((v) => Boolean(v.imageKey) || (v.caption?.length ?? 0) > 0, {
    message: 'Write something or add a photo',
    path: ['caption'],
  });

/** A reply on a post (§2.7). Text only: a reply is a sentence, not a post. */
export const createReplySchema = z.object({
  body: z.string().trim().min(1).max(MAX_REPLY_TEXT),
});

/**
 * Reactions toggle: posting one the user already left removes it. A single
 * endpoint rather than an add and a remove, because the client always knows
 * which emoji was tapped and never needs to know which state it was in.
 */
export const reactToPostSchema = z.object({
  reaction: z.enum(REACTION_KEYS),
});

/* ------------------------------------------------------------------ *
 * Tasks & reviews (§2.4)
 * ------------------------------------------------------------------ */

/**
 * `estimatedMinutes` is **optional**, and has to stay that way: the mobile app
 * creates tasks without it, and requiring one would break every task it makes at
 * runtime. The web form requires it; a task with no estimate simply cannot be
 * started, since there would be nothing to count down.
 */
const estimatedMinutesSchema = z.number().int().min(MIN_TASK_MINUTES).max(MAX_TASK_MINUTES);

export const createTaskSchema = z.object({
  groupId: ulidSchema,
  title: z.string().trim().min(1).max(MAX_TASK_TITLE),
  notes: z.string().trim().max(MAX_TASK_NOTES).optional(),
  dueDate: localDateSchema,
  estimatedMinutes: estimatedMinutesSchema.optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TASK_TITLE).optional(),
  notes: z.string().trim().max(MAX_TASK_NOTES).nullish(),
  dueDate: localDateSchema.optional(),
  estimatedMinutes: estimatedMinutesSchema.nullish(),
});

export const listTasksQuerySchema = z.object({
  groupId: ulidSchema.optional(),
  date: localDateSchema.optional(),
});

export const markTaskDoneSchema = z.object({
  proofText: z.string().trim().max(MAX_PROOF_TEXT).optional(),
  proofImageKey: z.string().max(200).optional(),
});

export const submitProofSchema = markTaskDoneSchema;

/**
 * A review either approves with a rating or sends the task back for proof.
 * `rating` belongs to the approve branch only, which the discriminated shape
 * below enforces rather than leaving it to the handler.
 */
export const reviewTaskSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal(REVIEW_ACTIONS[0]),
    rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
    comment: z.string().trim().max(MAX_REVIEW_COMMENT).optional(),
  }),
  z.object({
    action: z.literal(REVIEW_ACTIONS[1]),
    comment: z.string().trim().max(MAX_REVIEW_COMMENT).optional(),
  }),
]);

/* ------------------------------------------------------------------ *
 * Chat, leaderboard, reports
 * ------------------------------------------------------------------ */

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(MAX_MESSAGE_BODY),
});

export const listMessagesQuerySchema = paginationSchema.extend({
  before: z.string().datetime().optional(),
});

export const leaderboardQuerySchema = paginationSchema.extend({
  scope: z.enum(LEADERBOARD_SCOPES).default('weekly'),
});

/** Setting or clearing today's status (§2.6). Null clears it. */
export const setStatusSchema = z.object({
  statusKey: z.enum(STATUS_KEYS).nullable(),
});

/**
 * One group's standings. Not the paginated schema: a group is small enough to
 * return whole, and a cursor over four rows is ceremony.
 *
 * All-time by default, unlike the global board. A group's week is emptier than
 * the whole product's — on a Monday morning every member reads zero, which says
 * nothing about a group that has been going for a month.
 */
export const groupLeaderboardQuerySchema = z.object({
  scope: z.enum(LEADERBOARD_SCOPES).default('alltime'),
});

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: ulidSchema,
  reason: z.string().trim().min(1).max(80),
  note: z.string().trim().max(MAX_REPORT_NOTE).optional(),
});

/* ------------------------------------------------------------------ *
 * Inferred types — the app imports these rather than redeclaring them.
 * ------------------------------------------------------------------ */

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type BuddyDirectoryQuery = z.infer<typeof buddyDirectoryQuerySchema>;
export type MajorInput = z.infer<typeof majorSchema>;
export type CreateBuddyRequestInput = z.infer<typeof createBuddyRequestSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type ReviewTaskInput = z.infer<typeof reviewTaskSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
