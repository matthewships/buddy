-- Widens the education-level and major lists without touching the CHECKs that
-- forbid widening (§2.1).
--
-- Hand-edited, and the edit is the UPDATE: drizzle-kit generated the two ADD
-- COLUMNs and the index swap correctly but has no way to know the new columns
-- need the old ones' contents, and shipping it as generated would blank every
-- existing user's level and subject.
--
-- Why new columns rather than a wider CHECK. `users_education_level_check` and
-- `users_major_key_check` are table-level constraints, and SQLite can only
-- change one by rebuilding the table. 0003 warned that the rebuild is unsafe
-- here; this migration's commit proved it, in workerd against real D1:
--
--   PRAGMA foreign_keys = 1        -- D1 enforces them
--   child rows before = 1
--   child rows after  = 0          -- DROP TABLE users cascaded them away
--
-- `PRAGMA foreign_keys=OFF` is a no-op inside the transaction D1 wraps a
-- migration in, and `defer_foreign_keys=ON` does not stop the cascade either;
-- both were tested. Thirty ON DELETE CASCADE foreign keys point at `users`, so
-- a rebuild is not a risk to weigh, it is a way to empty the database.
--
-- The new columns carry no CHECK, following `goal_keys` in 0006: a constraint
-- that can only be widened by rebuilding is a constraint that can never be
-- widened, and Zod already rejects any key outside EDUCATION_LEVEL_KEYS or
-- MAJOR_KEYS on the way in. That is the gate that can grow. The old columns are
-- left exactly as they are — still holding what they held, still carrying their
-- original CHECKs — because dropping either would need the same rebuild.
ALTER TABLE `users` ADD `education_level_v2` text;--> statement-breakpoint
ALTER TABLE `users` ADD `major_key_v2` text;--> statement-breakpoint
-- The backfill. Every user keeps the level and subject they already gave.
UPDATE `users` SET `education_level_v2` = `education_level`, `major_key_v2` = `major_key`;--> statement-breakpoint
-- The directory filters move to the live columns. Indexed after the backfill so
-- the copy is not paying to maintain a b-tree it is about to fill anyway.
DROP INDEX `users_level_idx`;--> statement-breakpoint
DROP INDEX `users_major_idx`;--> statement-breakpoint
CREATE INDEX `users_level_v2_idx` ON `users` (`education_level_v2`);--> statement-breakpoint
CREATE INDEX `users_major_v2_idx` ON `users` (`major_key_v2`);
