CREATE TABLE `buddy_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`headline` text,
	`about` text,
	`availability` text,
	`checkin_style` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `buddy_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "buddy_requests_status_check" CHECK("status" IN ('pending', 'accepted', 'declined', 'expired')),
	CONSTRAINT "buddy_requests_not_self" CHECK("from_user_id" <> "to_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buddy_requests_one_pending_per_sender` ON `buddy_requests` (`from_user_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX `buddy_requests_to_user_idx` ON `buddy_requests` (`to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `buddy_requests_expiry_idx` ON `buddy_requests` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `buddy_requests_pair_idx` ON `buddy_requests` (`from_user_id`,`to_user_id`,`responded_at`);--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "credit_ledger_reason_check" CHECK("reason" IN ('task_approved', 'daily_bonus', 'streak', 'admin_adjust'))
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_user_idx` ON `credit_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_award_unique` ON `credit_ledger` (`user_id`,`reason`,`ref_type`,`ref_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expo_push_token` text NOT NULL,
	`platform` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "devices_platform_check" CHECK("platform" IN ('ios', 'android'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_unique` ON `devices` (`expo_push_token`);--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_codes_purpose_check" CHECK("purpose" IN ('verify', 'reset'))
);
--> statement-breakpoint
CREATE INDEX `email_codes_lookup_idx` ON `email_codes` (`user_id`,`purpose`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `group_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "group_invites_status_check" CHECK("status" IN ('pending', 'accepted', 'declined', 'expired'))
);
--> statement-breakpoint
CREATE INDEX `group_invites_to_user_idx` ON `group_invites` (`to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `group_invites_group_idx` ON `group_invites` (`group_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `group_invites_pending_unique` ON `group_invites` (`group_id`,`to_user_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "group_members_role_check" CHECK("role" IN ('owner', 'member'))
);
--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`created_by` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "groups_kind_check" CHECK("kind" IN ('friends', 'matched'))
);
--> statement-breakpoint
CREATE INDEX `groups_created_by_idx` ON `groups` (`created_by`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_group_created_idx` ON `messages` (`group_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`family_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_target_type_check" CHECK("target_type" IN ('task', 'message', 'user')),
	CONSTRAINT "reports_status_check" CHECK("status" IN ('open', 'actioned', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reports_reporter_target_unique` ON `reports` (`reporter_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `task_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`action` text NOT NULL,
	`rating` integer,
	`comment` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_reviews_action_check" CHECK("action" IN ('approve', 'request_proof')),
	CONSTRAINT "task_reviews_rating_shape" CHECK(("action" = 'approve' AND "rating" BETWEEN 0 AND 5) OR ("action" = 'request_proof' AND "rating" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `task_reviews_task_idx` ON `task_reviews` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_reviews_reviewer_idx` ON `task_reviews` (`reviewer_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`proof_text` text,
	`proof_image_key` text,
	`done_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tasks_status_check" CHECK("status" IN ('planned', 'done', 'proof_requested', 'approved', 'missed'))
);
--> statement-breakpoint
CREATE INDEX `tasks_user_date_idx` ON `tasks` (`user_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_group_date_idx` ON `tasks` (`group_id`,`due_date`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_rollover_idx` ON `tasks` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `user_badges` (
	`user_id` text NOT NULL,
	`badge_key` text NOT NULL,
	`awarded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `badge_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_stats` (
	`user_id` text PRIMARY KEY NOT NULL,
	`total_credits` integer DEFAULT 0 NOT NULL,
	`weekly_credits` integer DEFAULT 0 NOT NULL,
	`week_key` text,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`tasks_approved` integer DEFAULT 0 NOT NULL,
	`reviews_given` integer DEFAULT 0 NOT NULL,
	`last_approved_date` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_stats_total_idx` ON `user_stats` (`total_credits`);--> statement-breakpoint
CREATE INDEX `user_stats_weekly_idx` ON `user_stats` (`week_key`,`weekly_credits`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified_at` text,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_key` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`goal_key` text,
	`goal_text` text,
	`occupation_key` text,
	`occupation_text` text,
	`is_open_buddy` integer DEFAULT false NOT NULL,
	`last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "users_goal_key_check" CHECK("goal_key" IS NULL OR "goal_key" IN ('final_exam', 'university_project', 'thesis', 'sat', 'ielts_toefl', 'fitness', 'language', 'job_hunting', 'startup', 'reading', 'coding', 'custom')),
	CONSTRAINT "users_occupation_key_check" CHECK("occupation_key" IS NULL OR "occupation_key" IN ('student_high_school', 'student_undergrad', 'student_grad', 'employee', 'self_employed', 'job_seeker', 'custom'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE INDEX `users_directory_idx` ON `users` (`is_open_buddy`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `users_goal_idx` ON `users` (`goal_key`);--> statement-breakpoint
CREATE INDEX `users_occupation_idx` ON `users` (`occupation_key`);