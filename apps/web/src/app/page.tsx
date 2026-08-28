'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useMe } from '@/api/auth';
import { useSession } from '@/auth/store';
import { LoadingScreen } from '@/components/Spinner';

/**
 * The entry route picks the stack: auth, onboarding, or the tabs — the same
 * decision apps/mobile/app/index.tsx makes, and for the same reasons.
 *
 * Onboarding state comes from /me rather than from local state alone, so a user
 * who onboarded on another device is not asked again. While that first request
 * is in flight the store's cached value is used, which avoids a flash of the
 * wrong stack on a warm start.
 */
export default function Index() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const cachedOnboarded = useSession((s) => s.onboarded);
  const me = useMe();

  const waiting = status === 'loading' || (status === 'signedIn' && me.isPending && !cachedOnboarded);

  useEffect(() => {
    if (waiting) return;
    if (status === 'signedOut') {
      router.replace('/welcome');
      return;
    }
    const onboarded = me.data?.onboarded ?? cachedOnboarded;
    router.replace(onboarded ? '/today' : '/onboarding/profile');
  }, [cachedOnboarded, me.data?.onboarded, router, status, waiting]);

  return <LoadingScreen />;
}
