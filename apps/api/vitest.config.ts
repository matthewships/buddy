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
            // Overrides the deployed value so email codes reach the log and
            // the tests can read them back.
            ENVIRONMENT: 'development',
            ADMIN_TOKEN: 'test-admin-token',
            // Pinned rather than inherited: .dev.vars is gitignored, so a test
            // that asserted on whatever VAPID keys happened to be in it would
            // pass or fail depending on whose machine it ran on. These are the
            // RFC 8291 example keys — public, and never used against a real
            // push service.
            VAPID_PUBLIC_KEY:
              'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
            VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
