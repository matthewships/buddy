import { QueryClient } from '@tanstack/react-query';
import {
  type PersistQueryClientOptions,
  type Persister,
} from '@tanstack/react-query-persist-client';

/**
 * Server state — the web counterpart of apps/mobile/src/api/queryClient.ts.
 *
 * Two deliberate differences from the mobile module:
 *
 * 1. **A factory, not a module singleton.** The mobile app has one process per
 *    user, so a module-level client is safe there. This bundle runs inside a
 *    Worker isolate that serves many users' requests, and a shared client would
 *    be a cross-request cache. Providers holds one per mount instead.
 * 2. **`refetchOnWindowFocus` is on.** Mobile turns it off because a phone
 *    backgrounds and foregrounds constantly and reconnects matter more; a
 *    browser tab left open for hours is the normal case here, and returning to
 *    it should show current data.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 2,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
    },
  });
}

/**
 * The mobile app persists the cache to AsyncStorage so a cold start paints
 * immediately. `localStorage` is the browser's equivalent. Nothing sensitive
 * goes here — tokens are handled in auth/session.ts — but note this *is* cached
 * profile and task data in plain storage, same as on device.
 */
const localStoragePersister: Persister = {
  persistClient: async (client) => {
    try {
      window.localStorage.setItem('buddy.queryCache', JSON.stringify(client));
    } catch {
      // Quota exceeded, or storage blocked. The cache just stops persisting.
    }
  },
  restoreClient: async () => {
    try {
      const raw = window.localStorage.getItem('buddy.queryCache');
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      window.localStorage.removeItem('buddy.queryCache');
    } catch {
      // Nothing to do.
    }
  },
};

/**
 * Handed to `PersistQueryClientProvider` rather than kicked off from an effect.
 * The restore is asynchronous, so whoever starts it has to stop queries firing
 * until it lands — otherwise a returning user's first fetch beats the cache
 * they already have on disk. Only the provider can do that: it flips
 * `IsRestoringProvider` off when the restore settles, and `useQuery` refuses to
 * subscribe (and so to fetch) while that flag is on.
 *
 * The provider reads storage from an effect, which is also why `window` is
 * never touched during prerender — but the persister guards anyway, because
 * Safari private mode throws on access instead of returning null.
 */
export const cachePersistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: localStoragePersister,
  maxAge: 24 * 60 * 60 * 1000,
};
