/**
 * Status and kind enums shared by the D1 schema, the API validators and the app.
 * Keeping them here means a new state is added in exactly one place.
 */

export const GROUP_KINDS = ['friends', 'matched'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const GROUP_ROLES = ['owner', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'expired'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const TASK_STATUSES = ['planned', 'done', 'proof_requested', 'approved', 'missed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const REVIEW_ACTIONS = ['approve', 'request_proof'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const EMAIL_CODE_PURPOSES = ['verify', 'reset'] as const;
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];

export const PLATFORMS = ['ios', 'android'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const REPORT_TARGETS = ['task', 'message', 'user'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const LEADERBOARD_SCOPES = ['weekly', 'alltime'] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];
