-- Sessions (PRODUCT.md §3.1, slice 1): the clock the app already has, made an
-- object the group can see, and the streak and credits moved onto it.
--
-- Hand-written, ADD COLUMN and CREATE TABLE only, for the reason 0009 records.
-- Every new enum-shaped column is deliberately without a CHECK.
ALTER TABLE `tasks` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `actual_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `last_session_date` text;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `session_minutes_today` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `session_minutes_date` text;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `freezes_available` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `freezes_month` text;--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`host_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`planned_minutes` integer NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`scheduled_for` text,
	`started_at` text,
	`ended_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `sessions_group_state_idx` ON `sessions` (`group_id`,`state`);--> statement-breakpoint
CREATE INDEX `sessions_state_started_idx` ON `sessions` (`state`,`started_at`);--> statement-breakpoint
CREATE TABLE `session_participants` (
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text DEFAULT 'present' NOT NULL,
	`joined_at` text,
	`left_at` text,
	`last_seen_at` text,
	`present_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`session_id`, `user_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `session_participants_user_idx` ON `session_participants` (`user_id`,`state`);--> statement-breakpoint
CREATE TABLE `session_tasks` (
	`session_id` text NOT NULL,
	`task_id` text NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`session_id`, `task_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `session_tasks_task_idx` ON `session_tasks` (`task_id`);--> statement-breakpoint
CREATE TABLE `session_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` text NOT NULL,
	`reason` text NOT NULL,
	`minutes` integer NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `session_credits_award_unique` ON `session_credits` (`user_id`,`reason`,`ref_type`,`ref_id`);--> statement-breakpoint
CREATE INDEX `session_credits_user_idx` ON `session_credits` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rest_days` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'declared' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
