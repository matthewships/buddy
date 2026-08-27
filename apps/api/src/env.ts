/**
 * Typed bindings for the Worker (§4.1).
 *
 * The binding shape itself comes from `worker-configuration.d.ts`, which
 * `npm run cf-typegen` generates directly from wrangler.jsonc — so the types
 * cannot drift from the deployed configuration. This file only adds what
 * wrangler cannot know about: the secrets, which live in
 * `wrangler secret put` / `.dev.vars` rather than in the config file.
 */
export interface Env extends Cloudflare.Env {
  /** HS256 signing key for the 15-minute access token (§4.3). */
  JWT_SECRET?: string;
  /** Expo push access token used by the queue consumer (§4.6). */
  EXPO_ACCESS_TOKEN?: string;
  /** Bearer token guarding the /admin/* report endpoints (§4.4). */
  ADMIN_TOKEN?: string;
}

/**
 * Hono's generic slot: the bindings, plus whatever middleware attaches to the
 * request context.
 */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    /** Set by the auth middleware once the access token is verified (Phase 1). */
    userId?: string;
  };
}
