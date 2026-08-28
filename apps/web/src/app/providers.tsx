'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';

import { cachePersistOptions, makeQueryClient } from '@/api/queryClient';
import { useSession } from '@/auth/store';

/**
 * The web counterpart of apps/mobile/app/_layout.tsx.
 *
 * Two things the mobile root layout does are deliberately absent:
 *
 * - **No push registration.** A browser cannot receive the Expo push messages
 *   this API sends. The app is therefore permanently on the fallback the mobile
 *   app also has: the 15-second poll in `useIncomingRequests`, which exists
 *   precisely because push may be denied or undelivered. A buddy request still
 *   arrives within 15 seconds; it just never arrives as a notification.
 * - **No notification routing**, for the same reason.
 *
 * The query client is created per mount rather than imported as a module
 * singleton — see api/queryClient.ts for why that matters inside a Worker.
 *
 * Persistence is wired through `PersistQueryClientProvider` rather than started
 * from the effect below, because an effect cannot hold queries back: they mount
 * and fetch in the same commit, so the restore always lost the race and a
 * returning user paid for a `/me` round trip to see data that was already in
 * `localStorage`. The provider marks the tree as restoring until the read
 * settles, and `useQuery` stays idle for as long as that flag is set.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    // Reads tokens from `localStorage`, so it cannot run during prerender.
    void restore();
  }, [restore]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={cachePersistOptions}>
      {children}
    </PersistQueryClientProvider>
  );
}
