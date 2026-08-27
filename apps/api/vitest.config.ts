import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Tests run inside workerd with the real bindings from wrangler.jsonc — real
 * D1, real KV, real R2 — rather than mocks. The migrations in `drizzle/` are
 * read at config time and exposed as a test-only binding so the setup file can
 * apply them to the freshly reset database before each test.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle'));
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Secrets are not in wrangler.jsonc, so the test environment
            // supplies its own. The EMAIL binding is deliberately absent:
            // services/email.ts then logs codes instead of sending, which is
            // what the tests assert against.
            JWT_SECRET: 'test-secret-not-used-anywhere-real',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
