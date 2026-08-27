import * as SecureStore from 'expo-secure-store';

/**
 * Token storage and refresh (§5.1).
 *
 * Tokens live in expo-secure-store (Keychain / Keystore), never in
 * AsyncStorage: AsyncStorage is unencrypted and readable on a rooted device.
 * The TanStack Query cache is persisted separately and holds no credentials.
 */
const ACCESS_KEY = 'buddy.accessToken';
const REFRESH_KEY = 'buddy.refreshToken';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** In-flight refresh, shared so concurrent 401s trigger only one round trip. */
let refreshInFlight: Promise<boolean> | null = null;

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
 * Exchanges the refresh token for a new pair. Phase 1 wires this to
 * POST /auth/refresh; until that route exists it fails closed, which is the
 * correct behaviour for a missing endpoint — the caller signs the user out.
 */
export async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;
      // TODO(phase 1): POST /auth/refresh, rotate the pair, saveTokens().
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
