import type { NextConfig } from 'next';

/**
 * The web build (§5.1 of ARCHITECTURE.md, web parity).
 *
 * Every screen is a client component talking to the same Worker the Expo app
 * talks to, over `hc<AppType>()`. Nothing renders on the server, so there is no
 * Node runtime to configure and no bindings to declare — `@opennextjs/cloudflare`
 * only has to serve the built assets and the client bundle.
 */
const nextConfig: NextConfig = {
  // The API lives on its own Worker; the web app never proxies to it.
  reactStrictMode: true,
  typedRoutes: true,
};

export default nextConfig;
