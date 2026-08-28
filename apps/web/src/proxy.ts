import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers for the web client.
 *
 * These exist because of a tradeoff made in auth/session.ts: tokens live in
 * `localStorage`, since the API sends `Access-Control-Allow-Origin: *` and the
 * fetch spec forbids combining that with credentialed requests. That makes an
 * XSS on this origin able to read a session, so the Content-Security-Policy
 * here is the mitigation for the specific hole that decision opened — not
 * boilerplate.
 *
 * **Why nonces rather than `'unsafe-inline'`.** Next emits inline bootstrap and
 * flight-data scripts, so a CSP has to account for them somehow. Allowing
 * `'unsafe-inline'` would be the one-line option and would be very nearly
 * worthless here: an injected inline script is exactly the attack being
 * defended against, and `'unsafe-inline'` permits it. So each response gets a
 * fresh nonce, which Next picks up from the request's CSP header and stamps
 * onto its own script tags. `'strict-dynamic'` then lets those trusted scripts
 * load the chunk graph without every chunk needing to be listed.
 *
 * The usual objection to nonces — they force dynamic rendering, losing static
 * prerendering — costs this app almost nothing. Every route is a client
 * component behind a session guard, so the prerendered HTML is a loading
 * spinner either way; there is no static content being given up.
 */

/** The API origin, from the same build-time value the client is compiled with. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/**
 * The chat socket connects to the API over ws/wss, so `connect-src` needs the
 * WebSocket origin as well as the HTTP one — derived here exactly as
 * chat/useChatSocket.ts derives it, so the two cannot disagree.
 */
const API_WS_URL = API_URL.replace(/^http/, 'ws');

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' means the nonce'd bootstrap can load Next's chunks.
    // `next dev` compiles with eval, which production never needs.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`.trim(),
    // Next inlines critical CSS, and there is no nonce plumbing for style tags.
    // An injected <style> is a defacement risk, not a token-theft one, so this
    // is a deliberately different call from script-src.
    "style-src 'self' 'unsafe-inline'",
    // Avatars are served by the API from R2; `data:` covers inline SVG/img data.
    `img-src 'self' data: blob: ${API_URL}`,
    // The REST calls and the chat socket. Without these the app cannot load at
    // all, which is why they are derived rather than hardcoded.
    `connect-src 'self' ${API_URL} ${API_WS_URL}`,
    // Self-hosted system font stack only — no Google Fonts, nothing external.
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // The app has no legitimate reason to be framed; this is the CSP-level
    // equivalent of X-Frame-Options, which is also set below for older agents.
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';

  // crypto.getRandomValues rather than Node's Buffer: this runs in the Workers
  // runtime, where the Web Crypto API is the one that is actually available.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const csp = buildCsp(nonce, isDev);

  // Next reads the nonce out of the *request's* CSP header and applies it to
  // the scripts it renders, so it has to be set on both request and response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', csp);
  // Two years, matching what the API already sends, so the origin is pinned to
  // HTTPS even on a first visit typed without a scheme.
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  // The app asks for none of these; denying them means a compromised page
  // cannot either.
  response.headers.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  return response;
}

export const config = {
  /**
   * Documents only. Next's own static output under `/_next/static` is served
   * straight off Cloudflare's asset store and carries no session data, so
   * running the proxy for it would add latency for nothing.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
