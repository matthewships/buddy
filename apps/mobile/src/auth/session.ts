import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Token storage and refresh (§5.1).
 *
 * Tokens live in expo-secure-store (Keychain / Keystore), never AsyncStorage,
 * which is unencrypted and readable on a rooted device. The persisted TanStack
 * Query cache holds no credentials.
 */
const ACCESS_KEY = 'buddy.accessToken';
const REFRESH_KEY = 'buddy.refreshToken';

/**
 * Where the API lives.
 *
 * `EXPO_PUBLIC_API_URL` is inlined by Metro at build time and is what eas.json
 * sets per build profile, so a preview or production binary points at the
 * deployed Worker without an app.json edit. `extra.apiUrl` is the checked-in
 * default for local development, and localhost is the last resort.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.['apiUrl'] as string | undefined) ??
  'http://localhost:8787';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** In-flight refresh, shared so concurrent 401s trigger only one round trip. */
let refreshInFlight: Promise<boolean> | null = null;

/** Called when a refresh fails, so the session store can drop to signed-out. */
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
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
