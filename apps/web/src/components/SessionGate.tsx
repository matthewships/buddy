'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useMe } from '@/api/auth';
import { useSession } from '@/auth/store';

import { LoadingScreen } from './Spinner';

/**
 * Route guards.
 *
 * The Expo app needs nothing like this: it has one entry route
 * (apps/mobile/app/index.tsx) that picks a stack, and there is no way to land
 * anywhere else first. On the web every screen has a URL that can be typed,
 * bookmarked or shared, so the same decision has to be enforceable at whichever
 * route the browser actually opens.
 *
 * The rules are the ones app/index.tsx applies, in the same order:
 * signed out -> the auth stack; signed in but not onboarded -> onboarding;
 * otherwise the tabs. Onboarding state is read from /me rather than local state
 * alone, so a user who onboarded on another device is not asked again, and the
 * store's cached value covers the window while that request is in flight.
 */
export function RequireSession({
  children,
  requireOnboarded = true,
}: {
  children: React.ReactNode;
  requireOnboarded?: boolean;
}) {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const cachedOnboarded = useSession((s) => s.onboarded);
  const me = useMe();

  const onboarded = me.data?.onboarded ?? cachedOnboarded;
  // Matches app/index.tsx: don't act on /me until it resolves, unless the store
  // already says onboarded, which avoids a flash of the wrong stack.
  const deciding = status === 'loading' || (status === 'signedIn' && me.isPending && !cachedOnboarded);

  useEffect(() => {
    if (deciding) return;
    if (status === 'signedOut') {
      router.replace('/welcome');
      return;
    }
    if (requireOnboarded && !onboarded) {
      router.replace('/onboarding/profile');
    }
  }, [deciding, onboarded, requireOnboarded, router, status]);

  if (deciding || status === 'signedOut') return <LoadingScreen />;
  if (requireOnboarded && !onboarded) return <LoadingScreen />;

  return <>{children}</>;
}

/**
 * The inverse, for the auth screens: someone already signed in who navigates to
 * /login should land in the app rather than be asked to sign in again.
 */
export function RequireAnon({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === 'signedIn') router.replace('/today');
  }, [router, status]);

  if (status === 'loading' || status === 'signedIn') return <LoadingScreen />;

  return <>{children}</>;
}
