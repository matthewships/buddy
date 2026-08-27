/**
 * `cloudflare:test` types its `env` as `Cloudflare.Env`, the namespace wrangler
 * generates. Augmenting it here adds the test-only binding that
 * vitest.config.ts injects, so `env.TEST_MIGRATIONS` is typed in the setup file.
 */
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
