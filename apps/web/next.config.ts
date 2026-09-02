import type { NextConfig } from 'next';

/**
 * The web build (web parity with apps/mobile).
 *
 * Every screen is a client component talking to the same Worker the Expo app
 * talks to, over `hc<AppType>()`. Nothing renders on the server, so there is no
 * Node runtime to configure and no Cloudflare bindings to declare —
 * `@opennextjs/cloudflare` only has to serve the built assets and the client
 * bundle.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,

  /**
   * Make a deploy visible to somebody who has already been here.
   *
   * A prerendered route is served with `cache-control: s-maxage=31536000` and
   * nothing else. `s-maxage` binds shared caches only, so a browser is left
   * with no directive at all and falls back to *heuristic* freshness — it may
   * reuse the HTML for an unspecified time without ever asking. The symptom is
   * a landing page that does not change after a deploy, which is exactly what
   * happened on 2026-09-02.
   *
   * `max-age=0, must-revalidate` fixes it without giving up any caching worth
   * having: the response already carries an ETag, so revalidating is a
   * conditional request that comes back 304 with no body, and `s-maxage` is
   * left alone so the CDN still holds the page.
   *
   * Documents only. `/_next/static/*` is content-hashed and must keep its
   * immutable year — those files are never rewritten, only replaced.
   */
  async headers() {
    return [
      {
        // Everything except `/_next/`, via a negative lookahead — a bare
        // `/:path*` would match the hashed assets too and throw away the one
        // cache header that is unambiguously correct.
        source: '/:path((?!_next/).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate, s-maxage=31536000',
          },
        ],
      },
    ];
  },

  env: {
    /**
     * Where the API lives, inlined into the client bundle at build time.
     *
     * The default is chosen by NODE_ENV, which mirrors what eas.json does per
     * build profile for the Expo app: a production build points at the deployed
     * Worker, `next dev` points at the local one. Setting NEXT_PUBLIC_API_URL
     * explicitly overrides both.
     */
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      (process.env.NODE_ENV === 'production'
        ? 'https://buddy-api.ships.workers.dev'
        : 'http://localhost:8787'),
  },
};

export default nextConfig;
