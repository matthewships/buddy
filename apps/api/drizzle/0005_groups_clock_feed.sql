-- Groups, the task clock and the Feed (§2.3, §2.4, §2.7).
--
-- Two of these statements rebuild a table, which 0003 and 0004 both refused to
-- do. That refusal was specific, not general: it is about `users`, which six
-- tables reference with ON DELETE CASCADE, so dropping it inside the
-- transaction D1 wraps a migration in would cascade the database away.
--
-- `credit_ledger` and `reports` are leaves — nothing holds a foreign key to
-- either — so recreating them cascades nothing, and the rows are copied across
-- in the same statement group. A rebuild is the only way to widen a CHECK in
-- SQLite, and both need one: the ledger gains `task_abandoned` (the first
-- negative entry it can hold) and reports gain `post` as a target.
--
-- Everything else is additive: two nullable columns on `groups` for the Buddy
-- and the member who verifies the Buddy, two on `tasks` for the estimate and
-- the clock, and three new tables.

CREATE TABLE `group_invite_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`group_id` text NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_invite_links_token_unique` ON `group_invite_links` (`token`);--> statement-breakpoint
CREATE INDEX `group_invite_links_group_idx` ON `group_invite_links` (`group_id`);--> statement-breakpoint
CREATE TABLE `post_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`, `reaction`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_reactions_reaction_check" CHECK("reaction" IN ('heart', 'like', 'fire', 'clap', 'book', 'brain'))
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`image_key` text NOT NULL,
	`caption` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `posts_live_idx` ON `posts` (`deleted_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_user_idx` ON `posts` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "credit_ledger_reason_check" CHECK("reason" IN ('task_approved', 'daily_bonus', 'streak', 'task_abandoned', 'admin_adjust'))
);
--> statement-breakpoint
INSERT INTO `__new_credit_ledger`("id", "user_id", "amount", "reason", "ref_type", "ref_id", "created_at") SELECT "id", "user_id", "amount", "reason", "ref_type", "ref_id", "created_at" FROM `credit_ledger`;--> statement-breakpoint
DROP TABLE `credit_ledger`;--> statement-breakpoint
ALTER TABLE `__new_credit_ledger` RENAME TO `credit_ledger`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `credit_ledger_user_idx` ON `credit_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_award_unique` ON `credit_ledger` (`user_id`,`reason`,`ref_type`,`ref_id`);--> statement-breakpoint
CREATE TABLE `__new_reports` (
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
	CONSTRAINT "reports_target_type_check" CHECK("target_type" IN ('task', 'message', 'user', 'post')),
	CONSTRAINT "reports_status_check" CHECK("status" IN ('open', 'actioned', 'dismissed'))
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "reporter_id", "target_type", "target_id", "reason", "note", "status", "created_at", "resolved_at") SELECT "id", "reporter_id", "target_type", "target_id", "reason", "note", "status", "created_at", "resolved_at" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reports_reporter_target_unique` ON `reports` (`reporter_id`,`target_type`,`target_id`);--> statement-breakpoint
ALTER TABLE `groups` ADD `buddy_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `groups` ADD `buddy_verifier_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `estimated_minutes` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `started_at` text;--> statement-breakpoint
CREATE INDEX `tasks_running_idx` ON `tasks` (`user_id`,`started_at`);