'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { makeQueryClient, startCachePersistence } from '@/api/queryClient';
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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    // Both touch `localStorage`, so neither can run during prerender.
    startCachePersistence(queryClient);
    void restore();
  }, [queryClient, restore]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
