-- Pressure (PRODUCT.md §3.3, slice 2): the owner's start-by, every nudge,
-- on-time attendance, and the reliability it adds up to.
--
-- Hand-written, ADD COLUMN and CREATE TABLE only, for the reason 0009 records.
ALTER TABLE `tasks` ADD `start_by` text;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `reliability_pct` integer;--> statement-breakpoint
ALTER TABLE `user_stats` ADD `reliability_sessions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `session_participants` ADD `on_time` integer;--> statement-breakpoint
CREATE TABLE `nudges` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`task_id` text,
	`session_id` text,
	`from_user_id` text,
	`to_user_id` text NOT NULL,
	`template` text,
	`day` text NOT NULL,
	`scheduled_for` text,
	`sent_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `nudges_recipient_day_idx` ON `nudges` (`to_user_id`,`day`,`kind`);--> statement-breakpoint
CREATE INDEX `nudges_task_idx` ON `nudges` (`task_id`);--> statement-breakpoint
CREATE INDEX `nudges_pending_idx` ON `nudges` (`kind`,`sent_at`,`scheduled_for`);
