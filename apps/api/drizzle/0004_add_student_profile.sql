-- Student profile (§2.1): level of study, institution, major, country, city,
-- bio, and the topics/hobbies join table.
--
-- Hand-written, replacing what `drizzle-kit generate` produced, for the reason
-- 0003 records: Drizzle adds a table-level CHECK by rebuilding the table —
-- create __new_users, copy, DROP TABLE users, rename — and the
-- `PRAGMA foreign_keys=OFF` it emits is a no-op inside the transaction D1 wraps
-- each migration in. Six tables carry ON DELETE CASCADE foreign keys to users,
-- so that DROP would cascade the database away. SQLite enforces a CHECK given
-- on ADD COLUMN, so this keeps the same guarantee additively. The constraints
-- are unnamed here and named in meta/; the predicates are identical.
--
-- Every column is nullable. Existing users have none of these and there is
-- nothing to backfill them from — they are prompted on /profile/edit instead.
CREATE TABLE `user_tags` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `value`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_tags_kind_check" CHECK("kind" IN ('topic', 'interest'))
);--> statement-breakpoint
CREATE INDEX `user_tags_value_idx` ON `user_tags` (`kind`,`value`);--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `education_level` text CHECK("education_level" IS NULL OR "education_level" IN ('high_school', 'foundation', 'undergraduate', 'masters', 'phd', 'postdoc', 'recent_graduate'));--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `institution` text;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `institution_normalised` text;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `major_key` text CHECK("major_key" IS NULL OR "major_key" IN ('computer_science', 'software_engineering', 'data_science', 'engineering', 'mathematics', 'physics', 'chemistry', 'biology', 'medicine', 'nursing', 'pharmacy', 'psychology', 'economics', 'business', 'finance', 'marketing', 'law', 'politics', 'sociology', 'education', 'history', 'philosophy', 'languages', 'literature', 'architecture', 'design', 'art', 'music', 'media', 'environment', 'agriculture', 'sports_science', 'undecided', 'custom'));--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `major_text` text;--> statement-breakpoint
-- Shape, not membership: ISO 3166 is ~200 codes, and a CHECK that long could
-- only ever be widened by rebuilding the table. Zod rejects unknown codes.
ALTER TABLE `users` ADD COLUMN `country` text CHECK("country" IS NULL OR "country" GLOB '[A-Z][A-Z]');--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `city` text;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `bio` text;--> statement-breakpoint
CREATE INDEX `users_level_idx` ON `users` (`education_level`);--> statement-breakpoint
CREATE INDEX `users_major_idx` ON `users` (`major_key`);--> statement-breakpoint
CREATE INDEX `users_country_idx` ON `users` (`country`);--> statement-breakpoint
CREATE INDEX `users_institution_idx` ON `users` (`institution_normalised`);
