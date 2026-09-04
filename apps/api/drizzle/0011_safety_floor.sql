-- The safety floor (PRODUCT.md §6.1, slice 0): block, mute, leave with a
-- reason, quiet hours.
--
-- Hand-written, and only ADD COLUMN and CREATE TABLE, for the reason 0009
-- records: `users` has thirty ON DELETE CASCADE foreign keys pointing at it,
-- and the table rebuild drizzle-kit emits for anything else empties the
-- database. The two new columns carry defaults, which SQLite adds in place.
ALTER TABLE `users` ADD `quiet_hours_start` integer DEFAULT 23 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `quiet_hours_end` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
CREATE TABLE `user_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_blocks_not_self" CHECK("blocker_id" <> "blocked_id")
);--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_idx` ON `user_blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `group_mutes` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `group_mutes_user_idx` ON `group_mutes` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_departures` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `group_departures_group_idx` ON `group_departures` (`group_id`);
