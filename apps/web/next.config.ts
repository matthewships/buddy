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
