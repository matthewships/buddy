-- Adds the optional second goal (§2.1, MAX_GOALS = 2).
--
-- Hand-written, replacing what `drizzle-kit generate` produced. Drizzle renders
-- a table-level CHECK by rebuilding the table — create __new_users, copy, DROP
-- TABLE users, rename — which is not safe here: six tables carry FKs to users
-- with ON DELETE CASCADE, and the `PRAGMA foreign_keys=OFF` it emits is a no-op
-- inside the transaction D1 wraps each migration in. A dropped users table with
-- foreign keys still on would cascade the whole database away.
--
-- SQLite accepts a CHECK on ADD COLUMN and enforces it, so this keeps the same
-- guarantee additively. The only difference from the snapshot in meta/ is that
-- the constraint is unnamed here; it is the same predicate.
ALTER TABLE `users` ADD COLUMN `goal_key_2` text CHECK("goal_key_2" IS NULL OR "goal_key_2" IN ('final_exam', 'university_project', 'thesis', 'sat', 'ielts_toefl', 'fitness', 'language', 'job_hunting', 'startup', 'reading', 'coding', 'custom'));--> statement-breakpoint
CREATE INDEX `users_goal_2_idx` ON `users` (`goal_key_2`);
