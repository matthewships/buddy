/**
 * Token storage and refresh — the web counterpart of
 * apps/mobile/src/auth/session.ts.
 *
 * The mobile app keeps tokens in expo-secure-store (Keychain / Keystore). A
 * browser has no equivalent: the choices are `localStorage` or an httpOnly
 * cookie, and a cookie is not actually available here — the API sets
 * `Access-Control-Allow-Origin: *`, which the fetch spec forbids combining with
 * credentialed requests, and the API is a different origin besides. So tokens
 * live in `localStorage`, which means **an XSS on this origin can read them**.
 * That is the accepted tradeoff for a token-auth SPA against a wildcard-CORS
 * API; it is mitigated only by the 15-minute access-token TTL and the fact that
 * the app ships no user-authored HTML.
 */
const ACCESS_KEY = 'buddy.accessToken';
const REFRESH_KEY = 'buddy.refreshToken';

/**
 * Where the API lives.
 *
 * `NEXT_PUBLIC_API_URL` is inlined by Next at build time, and next.config.ts
 * defaults it per `NODE_ENV` — the deployed Worker for a production build, the
 * local Worker for `next dev`. That mirrors what eas.json does per build
 * profile for the Expo app.
 */
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Every screen is a client component, but Next still prerenders them at build
 * time, where `window` does not exist. Reads return null there rather than
 * throwing, so a prerender simply produces the signed-out shell.
 */
function readStore(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return null;
  }
}

function writeStore(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the session degrades to in-memory, which still
    // works until the tab is closed.
  }
}

/** In-flight refresh, shared so concurrent 401s trigger only one round trip. */
let refreshInFlight: Promise<boolean> | null = null;

/** Called when a refresh fails, so the session store can drop to signed-out. */
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

/**
 * Async to match the mobile module's signature exactly, even though
 * `localStorage` is synchronous — it keeps api/client.ts and the hooks that
 * were ported from apps/mobile byte-comparable, so a change on either side is
 * easy to mirror.
 */
export async function saveTokens(tokens: Tokens): Promise<void> {
  writeStore(ACCESS_KEY, tokens.accessToken);
  writeStore(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  writeStore(ACCESS_KEY, null);
  writeStore(REFRESH_KEY, null);
}

export async function getAccessToken(): Promise<string | null> {
  return readStore(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return readStore(REFRESH_KEY);
}

/**
 * Exchanges the refresh token for a rotated pair.
 *
 * Deliberately uses bare `fetch` rather than the API client: the client retries
 * through this function on a 401, so calling it here would recurse.
 */
export async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;

      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // The server revoked this family; the tokens are dead, not merely stale.
        await clearTokens();
        onSessionLost?.();
        return false;
      }

      const tokens = (await response.json()) as Tokens;
      await saveTokens(tokens);
      return true;
    } catch {
      // A network failure is not a revoked session — keep the tokens and let
      // the caller retry later.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
