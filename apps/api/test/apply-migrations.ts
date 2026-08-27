import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

/**
 * Applies `drizzle/*.sql` to the test D1 instance once per worker. Storage is
 * isolated per test file, so this runs against a clean database.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
