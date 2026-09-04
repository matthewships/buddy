-- Replies on a feed post (§2.7).
--
-- A new table, so drizzle-kit had nothing to rebuild and this is kept exactly
-- as generated — unlike 0003 and 0004, which had to be hand-written around the
-- table rebuild a CHECK constraint provokes.
--
-- Note what is *not* here: `posts.image_key` stays NOT NULL even though a post
-- may now be words alone. Dropping that constraint means rebuilding `posts`,
-- whose DROP TABLE would fire the ON DELETE CASCADE from `post_reactions` and
-- take every reaction with it. A text-only post stores `''` instead, and the
-- API maps it back to null; see the column comment in db/schema.ts.
--
-- Replies cascade with their post and with their author, which is what makes a
-- deleted post and a deleted account clean themselves up.

CREATE TABLE `post_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_replies_post_idx` ON `post_replies` (`post_id`,`created_at`);