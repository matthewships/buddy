import { defineConfig } from 'drizzle-kit';

/**
 * Generates plain SQL migrations into `drizzle/`, which is also the
 * `migrations_dir` in wrangler.jsonc — so `wrangler d1 migrations apply`
 * consumes exactly what drizzle-kit produces. Generation is offline; nothing
 * here connects to D1.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
