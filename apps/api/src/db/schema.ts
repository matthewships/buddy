import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import {
  CREDIT_REASONS,
  EMAIL_CODE_PURPOSES,
  GOAL_KEYS,
  GROUP_KINDS,
  GROUP_ROLES,
  OCCUPATION_KEYS,
  PLATFORMS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  REQUEST_STATUSES,
  REACTION_KEYS,
  REVIEW_ACTIONS,
  TASK_STATUSES,
  USER_TAG_KINDS,
} from '@buddy/shared';

/**
 * D1 schema (§4.2).
 *
 * Conventions, applied everywhere:
 * - ids are ULIDs stored as TEXT — lexicographically sortable, so `id` doubles
 *   as a creation-order cursor and most listings need no extra index
 * - timestamps are ISO-8601 UTC strings, not epoch integers, so raw D1 output
 *   is readable and comparisons stay lexicographic
 * - booleans are INTEGER 0/1, SQLite's native representation
 * - enum columns carry a CHECK constraint generated from the shared key lists,
 *   so the database rejects a state the app doesn't know about
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/**
 * A CHECK constraint generated from a shared enum, so the database and
 * `packages/shared` cannot drift. `nullable` allows the column to be unset
 * while still constraining any value that is present.
 */
/**
 * The education levels and majors as `0000_init` wrote them into the two CHECK
 * constraints on `users`. Copies, deliberately: `EDUCATION_LEVEL_KEYS` and
 * `MAJOR_KEYS` have grown since and will grow again, while what is written into
 * the database cannot change. See migration 0009.
 */
const FROZEN_LEVEL_KEYS = [
  'high_school',
  'foundation',
  'undergraduate',
  'masters',
  'phd',
  'postdoc',
  'recent_graduate',
] as const;

const FROZEN_MAJOR_KEYS = [
  'computer_science',
  'software_engineering',
  'data_science',
  'engineering',
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'medicine',
  'nursing',
  'pharmacy',
  'psychology',
  'economics',
  'business',
  'finance',
  'marketing',
  'law',
  'politics',
  'sociology',
  'education',
  'history',
  'philosophy',
  'languages',
  'literature',
  'architecture',
  'design',
  'art',
  'music',
  'media',
  'environment',
  'agriculture',
  'sports_science',
  'undecided',
  'custom',
] as const;

const enumCheck = (
  name: string,
  column: string,
  values: readonly string[],
  { nullable = false }: { nullable?: boolean } = {},
) => {
  const list = values.map((v) => `'${v}'`).join(', ');
  const guard = nullable ? `"${column}" IS NULL OR ` : '';
  return check(name, sql.raw(`${guard}"${column}" IN (${list})`));
};

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailVerifiedAt: text('email_verified_at'),
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    avatarKey: text('avatar_key'),
    timezone: text('timezone').notNull().default('UTC'),
    goalKey: text('goal_key'),
    // The optional second goal (§2.1, MAX_GOALS). A separate nullable column
    // rather than a widened goal_key: the existing column is indexed, checked
    // and read by every client, and only the directory query needs to know
    // there are now two.
    goalKey2: text('goal_key_2'),
    /**
     * Every goal the user picked, in pick order, as a JSON array — signup stopped
     * capping the picker. `goal_key` and `goal_key_2` remain the indexed,
     * CHECK-constrained pair that matching and the mobile app read; PATCH /me
     * derives them from the first two entries here, so the two representations
     * cannot disagree. Null on accounts that predate the list.
     */
    goalKeys: text('goal_keys', { mode: 'json' }).$type<string[]>(),
    goalText: text('goal_text'),
    // Kept, and kept correct, though signup no longer asks: it is indexed,
    // CHECK-constrained and read by apps/mobile. PATCH /me derives it from
    // education_level (OCCUPATION_FOR_LEVEL) whenever a level is written.
    occupationKey: text('occupation_key'),
    occupationText: text('occupation_text'),
    /* Student profile (§2.1). All nullable: users who onboarded before these
       existed have none of them, and there is nothing to backfill them with. */
    /**
     * Frozen 2026-09-02. `education_level` carries a CHECK listing the seven
     * levels that existed before `middle_school`, and SQLite cannot widen a
     * CHECK in place — only by rebuilding the table, which 0003 established is
     * unsafe here and which a test in 0009's commit proved destroys the child
     * rows. So the column is left where it is, still holding what it held, and
     * the product reads `educationLevel` below. Nothing writes this again.
     */
    educationLevelLegacy: text('education_level'),
    /** The live column. Deliberately unchecked — see the note on the indexes. */
    educationLevel: text('education_level_v2'),
    institution: text('institution'),
    /**
     * `institution` folded by `normaliseInstitution()`. Stored rather than
     * computed per query so "same institution as me" is an indexed equality
     * instead of a function applied to every row in the directory.
     */
    institutionNormalised: text('institution_normalised'),
    /** What `custom` means, when it is one of the user's interests. */
    interestText: text('interest_text'),
    /** Frozen 2026-09-02, exactly as `education_level` above. */
    majorKeyLegacy: text('major_key'),
    /** The live column. Deliberately unchecked — see the note on the indexes. */
    majorKey: text('major_key_v2'),
    majorText: text('major_text'),
    /**
     * `YYYY-MM-DD`, and the only field in this table that exists to refuse
     * somebody rather than describe them (§2.8). Nullable, because every
     * account created before 2026-09-02 predates the question and there is
     * nothing to backfill it with — an unanswered age is not a young one.
     *
     * No CHECK. The floor is `MIN_AGE_YEARS`, which is a number that can move,
     * and a constraint over it could only be widened by rebuilding this table
     * — the thing migration 0009 exists to explain is impossible here.
     */
    dateOfBirth: text('date_of_birth'),
    /** ISO 3166-1 alpha-2. */
    country: text('country'),
    city: text('city'),
    bio: text('bio'),
    /**
     * Today's status (§2.6). Two columns rather than one, because a status is
     * only true for the day it was set: `status_date` is the setter's own local
     * day, and the value is simply not shown on any other one. That makes
     * expiry a comparison at read time — no cron, and nothing to clean up.
     *
     * Not CHECK-constrained, for the same reason `user_badges.badge_key` is
     * not: the option list lives in packages/shared, and retiring one should
     * stay a config change rather than a migration.
     */
    statusKey: text('status_key'),
    statusDate: text('status_date'),
    isOpenBuddy: integer('is_open_buddy', { mode: 'boolean' }).notNull().default(false),
    // Set when the user finishes onboarding (handle, goal, occupation). The app
    // reads it to decide between the onboarding stack and the tabs; deriving it
    // from whether other fields look "filled in" would be guesswork.
    onboardedAt: text('onboarded_at'),
    lastSeenAt: text('last_seen_at'),
    createdAt: text('created_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    // Case-insensitive uniqueness: emails and handles are lowercased by the
    // Zod schemas before they ever reach here, and these indexes are the
    // backstop.
    uniqueIndex('users_email_unique').on(t.email),
    uniqueIndex('users_handle_unique').on(t.handle),
    // The buddy directory filters on is_open_buddy and orders by last_seen_at.
    index('users_directory_idx').on(t.isOpenBuddy, t.lastSeenAt),
    index('users_goal_idx').on(t.goalKey),
    index('users_goal_2_idx').on(t.goalKey2),
    index('users_occupation_idx').on(t.occupationKey),
    // The student filters on the directory. Both point at the live columns; the
    // frozen ones keep their original indexes, which cost nothing and would
    // need a rebuild to drop.
    index('users_level_v2_idx').on(t.educationLevel),
    index('users_major_v2_idx').on(t.majorKey),
    index('users_country_idx').on(t.country),
    index('users_institution_idx').on(t.institutionNormalised),
    enumCheck('users_goal_key_check', 'goal_key', GOAL_KEYS, { nullable: true }),
    enumCheck('users_goal_key_2_check', 'goal_key_2', GOAL_KEYS, { nullable: true }),
    enumCheck('users_occupation_key_check', 'occupation_key', OCCUPATION_KEYS, { nullable: true }),
    /**
     * These two describe the *frozen* columns, so they are spelled out rather
     * than generated from the shared enums. Generating them would silently
     * render the widened lists, drizzle-kit would see a changed constraint, and
     * it would reach for the table rebuild that must never run on this table.
     * The live `education_level_v2` and `major_key_v2` carry no CHECK at all:
     * following 0006's `goal_keys`, membership is enforced by Zod at the edge,
     * which is the only gate that can be widened without a rebuild.
     */
    enumCheck('users_education_level_check', 'education_level', FROZEN_LEVEL_KEYS, {
      nullable: true,
    }),
    enumCheck('users_major_key_check', 'major_key', FROZEN_MAJOR_KEYS, { nullable: true }),
    /**
     * Country is checked for *shape*, not membership. The other enums are
     * short, app-defined lists; ISO 3166 is ~200 codes, and a CHECK that long
     * can only ever be changed by rebuilding the table — which 0003 established
     * is unsafe here, because six tables carry ON DELETE CASCADE foreign keys
     * to users. Zod rejects an unknown code at the edge; this stops junk.
     */
    check('users_country_check', sql`"country" IS NULL OR "country" GLOB '[A-Z][A-Z]'`),
  ],
);

/**
 * Favourite topics and hobbies (§2.1), one row per tag.
 *
 * A join table rather than a JSON column on users, because these are filter
 * targets: `WHERE kind = 'topic' AND value = ?` uses an index, while the
 * equivalent over a JSON array is a scan with `json_each` on every row. It is
 * also what the Feed will filter on.
 *
 * The composite primary key is the deduplication: the same user cannot hold the
 * same tag twice, whatever a client sends.
 */
export const userTags = sqliteTable(
  'user_tags',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.value] }),
    // "Everyone who picked this topic" — the directory filter's direction.
    index('user_tags_value_idx').on(t.kind, t.value),
    enumCheck('user_tags_kind_check', 'kind', USER_TAG_KINDS),
  ],
);

export const buddyProfiles = sqliteTable('buddy_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline'),
  about: text('about'),
  availability: text('availability'),
  checkinStyle: text('checkin_style'),
  updatedAt: text('updated_at').notNull().default(now),
});

export const emailCodes = sqliteTable(
  'email_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('email_codes_lookup_idx').on(t.userId, t.purpose, t.consumedAt),
    enumCheck('email_codes_purpose_check', 'purpose', EMAIL_CODE_PURPOSES),
  ],
);

export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expoPushToken: text('expo_push_token').notNull(),
    platform: text('platform').notNull(),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    // A token identifies one app install; if it reappears for another user the
    // row is reassigned rather than duplicated.
    uniqueIndex('devices_token_unique').on(t.expoPushToken),
    index('devices_user_idx').on(t.userId),
    enumCheck('devices_platform_check', 'platform', PLATFORMS),
  ],
);

/**
 * Browser push subscriptions (§4.6).
 *
 * Kept apart from `devices` rather than folded into it. A Web Push subscription
 * is not a token: it is a push-service URL plus two keys the browser generates,
 * and it has no `expo_push_token` and no `platform` from `PLATFORMS`. Widening
 * `devices` would have meant making a NOT NULL column nullable and rebuilding a
 * CHECK constraint — SQLite cannot alter either in place — for a row shape that
 * shares no column with the ones already there.
 */
export const webPushSubscriptions = sqliteTable(
  'web_push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The push service URL to POST the encrypted payload to. */
    endpoint: text('endpoint').notNull(),
    /** The subscription's P-256 public key, base64url (RFC 8291 `ua_public`). */
    p256dh: text('p256dh').notNull(),
    /** The 16-byte shared auth secret, base64url. */
    auth: text('auth').notNull(),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    // An endpoint identifies one browser profile, exactly as a push token
    // identifies one app install: if it reappears for another user — a shared
    // computer, a second account — the row is reassigned, not duplicated.
    uniqueIndex('web_push_endpoint_unique').on(t.endpoint),
    index('web_push_user_idx').on(t.userId),
  ],
);

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Rotation family: reuse of a superseded token revokes the whole family (§4.3).
    familyId: text('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_unique').on(t.tokenHash),
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_user_idx').on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Groups & invitations
 * ------------------------------------------------------------------ */

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    // 'matched' groups are the 2-person groups a buddy request creates (§2.2);
    // 'friends' groups are made by hand and invite by @handle (§2.3).
    kind: text('kind').notNull(),
    /**
     * The member who verifies everyone else's tasks (§2.4). Nullable, and null
     * is not a degenerate case: a group without one keeps the original rule
     * where any member may review. That is what every existing group and the
     * mobile app rely on.
     */
    buddyUserId: text('buddy_user_id').references(() => users.id),
    /**
     * Who verifies the Buddy's *own* tasks — nobody may approve their own, so a
     * lone verifier would otherwise have no one to check them. The Buddy
     * nominates this person; when it is null, or they have left, review falls
     * back to any member, so a task can never be stuck unreviewable.
     */
    buddyVerifierId: text('buddy_verifier_id').references(() => users.id),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [enumCheck('groups_kind_check', 'kind', GROUP_KINDS), index('groups_created_by_idx').on(t.createdBy)],
);

/**
 * A join link, for inviting someone who is not a user yet (§2.3).
 *
 * Separate from `group_invites` rather than a nullable `to_user_id` on it: a
 * targeted invite names one recipient and is accepted once, while a link names
 * nobody and may be used many times. Sharing a table would make every existing
 * invite query check which kind of row it was holding.
 *
 * A link is a bearer capability, so it is bounded on both axes — it expires and
 * it has a use count — and can be revoked outright.
 */
export const groupInviteLinks = sqliteTable(
  'group_invite_links',
  {
    id: text('id').primaryKey(),
    /** URL-safe random, not the id: the id is a sortable ULID and guessable. */
    token: text('token').notNull(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    maxUses: integer('max_uses').notNull(),
    uses: integer('uses').notNull().default(0),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('group_invite_links_token_unique').on(t.token),
    index('group_invite_links_group_idx').on(t.groupId),
  ],
);

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: text('joined_at').notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    // "Which groups am I in?" is on the hot path for /tasks and the directory's
    // group-mate exclusion, and the primary key can't serve it.
    index('group_members_user_idx').on(t.userId),
    enumCheck('group_members_role_check', 'role', GROUP_ROLES),
  ],
);

export const groupInvites = sqliteTable(
  'group_invites',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(now),
    respondedAt: text('responded_at'),
  },
  (t) => [
    index('group_invites_to_user_idx').on(t.toUserId, t.status),
    index('group_invites_group_idx').on(t.groupId, t.status),
    // The same person is not invited to the same group twice while one invite
    // is still outstanding.
    uniqueIndex('group_invites_pending_unique')
      .on(t.groupId, t.toUserId)
      .where(sql`status = 'pending'`),
    enumCheck('group_invites_status_check', 'status', REQUEST_STATUSES),
  ],
);

export const buddyRequests = sqliteTable(
  'buddy_requests',
  {
    id: text('id').primaryKey(),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message'),
    status: text('status').notNull().default('pending'),
    // Set server-side to created_at + 5 min; the countdown is driven by this
    // value, never by the phone clock (§4.5).
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(now),
    respondedAt: text('responded_at'),
  },
  (t) => [
    // "Only one pending request at a time per requester" (§2.2), enforced by
    // the database rather than by a read-then-write race in the handler.
    uniqueIndex('buddy_requests_one_pending_per_sender')
      .on(t.fromUserId)
      .where(sql`status = 'pending'`),
    index('buddy_requests_to_user_idx').on(t.toUserId, t.status),
    // Lazy expiry sweeps pending rows by expires_at on every touching request.
    index('buddy_requests_expiry_idx').on(t.status, t.expiresAt),
    // Powers the re-request cooldown: most recent response between two people.
    index('buddy_requests_pair_idx').on(t.fromUserId, t.toUserId, t.respondedAt),
    enumCheck('buddy_requests_status_check', 'status', REQUEST_STATUSES),
    check('buddy_requests_not_self', sql`"from_user_id" <> "to_user_id"`),
  ],
);

/* ------------------------------------------------------------------ *
 * Tasks & reviews
 * ------------------------------------------------------------------ */

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    // The owner's *local* calendar day (YYYY-MM-DD), not a UTC instant: the
    // hourly rollover cron compares against midnight in the user's timezone.
    dueDate: text('due_date').notNull(),
    /**
     * How long the owner said this would take. Nullable because the mobile app
     * does not ask, and a task without one simply cannot be started — there
     * would be nothing to count down.
     */
    estimatedMinutes: integer('estimated_minutes'),
    /**
     * When the owner started the clock. Not a status: a running task is still
     * `planned`, and "running" is `started_at IS NOT NULL` plus a status that
     * has not closed yet. Making it a status would have meant a new edge into
     * and out of every existing transition.
     */
    startedAt: text('started_at'),
    status: text('status').notNull().default('planned'),
    proofText: text('proof_text'),
    proofImageKey: text('proof_image_key'),
    doneAt: text('done_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    // The Today tab: one user's tasks for a given local day.
    index('tasks_user_date_idx').on(t.userId, t.dueDate),
    // A group's board, and the buddies' review queue.
    index('tasks_group_date_idx').on(t.groupId, t.dueDate, t.status),
    // The rollover job scans planned tasks by day across all users.
    index('tasks_rollover_idx').on(t.status, t.dueDate),
    // "Is this person on the clock?" — asked by the chat room on every inbound
    // message, so it has to be an index rather than a scan.
    index('tasks_running_idx').on(t.userId, t.startedAt),
    enumCheck('tasks_status_check', 'status', TASK_STATUSES),
  ],
);

export const taskReviews = sqliteTable(
  'task_reviews',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    reviewerId: text('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    // NULL for request_proof; 0-5 for approve, where 0 is a rejection.
    rating: integer('rating'),
    comment: text('comment'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('task_reviews_task_idx').on(t.taskId),
    index('task_reviews_reviewer_idx').on(t.reviewerId),
    enumCheck('task_reviews_action_check', 'action', REVIEW_ACTIONS),
    // Mirrors the discriminated union in packages/shared: a rating belongs to
    // an approval and only an approval.
    check(
      'task_reviews_rating_shape',
      sql`("action" = 'approve' AND "rating" BETWEEN 0 AND 5) OR ("action" = 'request_proof' AND "rating" IS NULL)`,
    ),
    // A reviewer may not review their own task (§2.4).
    // Enforced in the service layer too, since SQLite CHECK cannot join.
  ],
);

/* ------------------------------------------------------------------ *
 * Credits, stats, badges
 * ------------------------------------------------------------------ */

export const creditLedger = sqliteTable(
  'credit_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    refType: text('ref_type'),
    refId: text('ref_id'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('credit_ledger_user_idx').on(t.userId, t.createdAt),
    // Append-only, so a repeated award is prevented by making (user, reason,
    // ref) unique rather than by checking before insert.
    uniqueIndex('credit_ledger_award_unique').on(t.userId, t.reason, t.refType, t.refId),
    enumCheck('credit_ledger_reason_check', 'reason', CREDIT_REASONS),
  ],
);

export const userStats = sqliteTable(
  'user_stats',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    totalCredits: integer('total_credits').notNull().default(0),
    weeklyCredits: integer('weekly_credits').notNull().default(0),
    // ISO week the weekly total belongs to, e.g. "2026-W35". A mismatch means
    // the weekly figure is stale and resets to 0 on next write.
    weekKey: text('week_key'),
    currentStreak: integer('current_streak').notNull().default(0),
    bestStreak: integer('best_streak').notNull().default(0),
    tasksApproved: integer('tasks_approved').notNull().default(0),
    reviewsGiven: integer('reviews_given').notNull().default(0),
    lastApprovedDate: text('last_approved_date'),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    // Leaderboard ordering (the KV snapshot is built from these).
    index('user_stats_total_idx').on(t.totalCredits),
    index('user_stats_weekly_idx').on(t.weekKey, t.weeklyCredits),
  ],
);

export const userBadges = sqliteTable(
  'user_badges',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Validated against BADGE_KEYS in the service layer; deliberately not a
    // CHECK constraint, so adding a badge to packages/shared/badges.ts stays a
    // config change and never needs a migration (§2.5).
    badgeKey: text('badge_key').notNull(),
    awardedAt: text('awarded_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeKey] })],
);

/* ------------------------------------------------------------------ *
 * Chat & moderation
 * ------------------------------------------------------------------ */

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    // History paging is newest-first within a group (§4.4).
    index('messages_group_created_idx').on(t.groupId, t.createdAt),
  ],
);

/**
 * Feed posts (§2.7) — a photo and an optional caption, visible to every signed-in
 * user.
 *
 * Global rather than scoped to groups, which is a deliberate trade: it is the
 * one place in Buddy where a new account with no group yet has something to look
 * at, and the price is that it is a public surface and needs the report path
 * (`REPORT_TARGETS` includes 'post') from the first day.
 *
 * Soft-deleted like users, so a removed post leaves its reactions' foreign keys
 * intact rather than vanishing from under them.
 */
export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The photo, or `''` for a post that is only words.
     *
     * The empty string is a sentinel, and a deliberate one. A post is now a
     * photo, a caption, or both, so this column wants to be nullable — but
     * dropping NOT NULL in SQLite means rebuilding the table, and `posts` is
     * the parent of `post_reactions` with ON DELETE CASCADE. The DROP TABLE a
     * rebuild performs fires that cascade, and the `PRAGMA foreign_keys=OFF`
     * drizzle emits is a no-op inside the transaction D1 wraps each migration
     * in — so the rebuild would take every reaction in the database with it.
     * That is the same hazard 0003 and 0004 were hand-written to avoid.
     *
     * So the column keeps its constraint and the API maps `''` to `null` on the
     * way out, in one helper, so that no caller ever sees the sentinel.
     */
    imageKey: text('image_key').notNull(),
    caption: text('caption'),
    createdAt: text('created_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    // The feed is newest-first over every post; the id is a ULID, so it sorts
    // by creation without a second column.
    index('posts_live_idx').on(t.deletedAt, t.id),
    index('posts_user_idx').on(t.userId),
  ],
);

/**
 * Replies on a post (§2.7).
 *
 * Its own table rather than a thread on the post, because a flat list per post
 * — oldest first, no replies to replies — is all the Feed wants. The Feed is
 * where people say "nice one"; holding an actual conversation is what the group
 * chat is for, and a nesting model would invite one.
 */
export const postReplies = sqliteTable(
  'post_replies',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    // "The replies on this post, oldest first" — the only read there is.
    index('post_replies_post_idx').on(t.postId, t.createdAt),
  ],
);

/**
 * One row per (post, user, emoji). The composite primary key is what makes a
 * reaction a toggle rather than a counter: a second tap deletes the row it would
 * otherwise duplicate, and no client can inflate a count by sending twice.
 */
export const postReactions = sqliteTable(
  'post_reactions',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId, t.reaction] }),
    enumCheck('post_reactions_reaction_check', 'reaction', REACTION_KEYS),
  ],
);

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    note: text('note'),
    status: text('status').notNull().default('open'),
    createdAt: text('created_at').notNull().default(now),
    resolvedAt: text('resolved_at'),
  },
  (t) => [
    // The admin queue reads open reports oldest-first.
    index('reports_status_idx').on(t.status, t.createdAt),
    index('reports_target_idx').on(t.targetType, t.targetId),
    // One report per person per target: re-reporting the same thing is a no-op
    // rather than a way to inflate a count.
    uniqueIndex('reports_reporter_target_unique').on(t.reporterId, t.targetType, t.targetId),
    enumCheck('reports_target_type_check', 'target_type', REPORT_TARGETS),
    enumCheck('reports_status_check', 'status', REPORT_STATUSES),
  ],
);

/* ------------------------------------------------------------------ *
 * Row types — services and route handlers use these instead of
 * redeclaring shapes that the schema already describes.
 * ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BuddyProfile = typeof buddyProfiles.$inferSelect;
export type EmailCode = typeof emailCodes.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupInvite = typeof groupInvites.$inferSelect;
export type BuddyRequest = typeof buddyRequests.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskReview = typeof taskReviews.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type UserStats = typeof userStats.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Report = typeof reports.$inferSelect;
