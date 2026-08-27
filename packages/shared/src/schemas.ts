import { z } from 'zod';

import { GOAL_KEYS } from './goals';
import { OCCUPATION_KEYS } from './occupations';
import { MAX_RATING, MIN_RATING } from './credits';
import {
  DEFAULT_PAGE_SIZE,
  EMAIL_CODE_LENGTH,
  MAX_ABOUT,
  MAX_AVAILABILITY,
  MAX_CHECKIN_STYLE,
  MAX_DISPLAY_NAME,
  MAX_GOAL_TEXT,
  MAX_HANDLE,
  MAX_HEADLINE,
  MAX_MESSAGE_BODY,
  MAX_OCCUPATION_TEXT,
  MAX_PAGE_SIZE,
  MAX_PROOF_TEXT,
  MAX_REPORT_NOTE,
  MAX_REQUEST_MESSAGE,
  MAX_REVIEW_COMMENT,
  MAX_TASK_NOTES,
  MAX_TASK_TITLE,
  MIN_HANDLE,
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

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
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
 * Goal and occupation are each a key plus free text. When the key is `custom`
 * the text is what the user typed and is required; otherwise the text is an
 * optional elaboration (field of study, job title, which exam).
 */
export const goalSchema = z
  .object({
    goalKey: z.enum(GOAL_KEYS),
    goalText: z.string().trim().max(MAX_GOAL_TEXT).optional(),
  })
  .refine((v) => v.goalKey !== 'custom' || (v.goalText?.length ?? 0) > 0, {
    message: 'Describe your goal',
    path: ['goalText'],
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
    goalText: z.string().trim().max(MAX_GOAL_TEXT).nullish(),
    occupationKey: z.enum(OCCUPATION_KEYS).optional(),
    occupationText: z.string().trim().max(MAX_OCCUPATION_TEXT).nullish(),
    buddyProfile: buddyProfileSchema.optional(),
  })
  .refine((v) => v.goalKey !== 'custom' || (v.goalText?.length ?? 0) > 0, {
    message: 'Describe your goal',
    path: ['goalText'],
  })
  .refine((v) => v.occupationKey !== 'custom' || (v.occupationText?.length ?? 0) > 0, {
    message: 'Describe what you do',
    path: ['occupationText'],
  });

export const registerDeviceSchema = z.object({
  expoPushToken: z.string().min(1).max(200),
  platform: z.enum(PLATFORMS),
});

/* ------------------------------------------------------------------ *
 * Buddies & requests (§2.2)
 * ------------------------------------------------------------------ */

export const buddyDirectoryQuerySchema = paginationSchema.extend({
  goal: z.enum(GOAL_KEYS).optional(),
  occupation: z.enum(OCCUPATION_KEYS).optional(),
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
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

/* ------------------------------------------------------------------ *
 * Tasks & reviews (§2.4)
 * ------------------------------------------------------------------ */

export const createTaskSchema = z.object({
  groupId: ulidSchema,
  title: z.string().trim().min(1).max(MAX_TASK_TITLE),
  notes: z.string().trim().max(MAX_TASK_NOTES).optional(),
  dueDate: localDateSchema,
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TASK_TITLE).optional(),
  notes: z.string().trim().max(MAX_TASK_NOTES).nullish(),
  dueDate: localDateSchema.optional(),
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
export type CreateBuddyRequestInput = z.infer<typeof createBuddyRequestSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type ReviewTaskInput = z.infer<typeof reviewTaskSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
