'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useMe } from '@/api/auth';
import { useSession } from '@/auth/store';
import { useDraft } from '@/onboarding/draft';
import { FIRST_STEP } from '@/onboarding/steps';

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
 * signed out -> the auth stack; signed in but not onboarded -> the questions;
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
      router.replace(FIRST_STEP);
    }
  }, [deciding, onboarded, requireOnboarded, router, status]);

  if (deciding || status === 'signedOut') return <LoadingScreen />;
  if (requireOnboarded && !onboarded) return <LoadingScreen />;

  return <>{children}</>;
}

/**
 * The inverse, for the auth screens: someone already signed in who navigates to
 * /login should land in the app rather than be asked to sign in again.
 *
 * Unlike `RequireSession` this renders nothing and gates nothing. The gate it
 * replaces returned a spinner while `status === 'loading'`, and since that is
 * also the state the server prerenders in — `restore()` cannot read
 * `localStorage` without a `window` — the shipped HTML for /welcome, /login and
 * /register *was* a spinner: no real content until ~630 KiB of JS had parsed
 * and hydrated. Blocking bought nothing, either. A signed-out visitor is the
 * overwhelming case and sees the screen they asked for; the rare signed-in one
 * gets a form for the few milliseconds before the effect below fires, and a
 * form is harmless — worst case they sign in again.
 *
 * Still `/buddies` and not the onboarding-aware destination `LandingRedirect`
 * picks: an unonboarded user bounces off `/buddies` into the questions via
 * `RequireSession`, which is what this route did before and one fewer /me
 * request on a screen that does not need it.
 *
 * A pending join link outranks it. `signIn()` runs inside the login and verify
 * mutation functions, so the session flips while the mutation is still pending
 * and this effect fires *before* those screens' own `onSuccess` navigation —
 * they replace it and win. That makes this the fallback rather than the
 * decision, and a fallback that drops an invitation is how the invite link
 * broke in the first place, so it carries the same rule.
 *
 * Never `/onboarding/done`, whatever the draft holds: that screen writes the
 * draft to `PATCH /me` on arrival, and someone signing in to an existing
 * account is exactly who must not have their profile overwritten by answers
 * typed while signed out.
 */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const inviteToken = useDraft((d) => d.inviteToken);

  useEffect(() => {
    if (status === 'signedIn') router.replace(inviteToken ? `/join/${inviteToken}` : '/buddies');
  }, [inviteToken, router, status]);

  return null;
}

/**
 * The entry route's half of the same split: `/` shows the landing screen to
 * everyone and this sends a session on to where it belongs — /buddies, or
 * onboarding if it was never finished. The rules are app/index.tsx's, in its
 * order.
 *
 * Onboarding state comes from /me rather than from local state alone, so a user
 * who onboarded on another device is not asked again. While that first request
 * is in flight the store's cached value is used, which avoids a flash of the
 * wrong stack on a warm start.
 *
 * This one *does* take the screen over once it knows there is a session, which
 * `RedirectIfSignedIn` deliberately does not: `/` is where login lands
 * (`router.replace('/')`), so a signed-in user passes through here on the hot
 * path, and for an unonboarded one the /me round trip above would otherwise
 * leave "Create an account" on screen for its whole duration. The condition is
 * `'signedIn'` and never `'loading'` — swapping in the spinner during 'loading'
 * would rebuild exactly the prerender problem this change removes.
 */
export function LandingRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const cachedOnboarded = useSession((s) => s.onboarded);
  const me = useMe();

  const waiting = status === 'loading' || (status === 'signedIn' && me.isPending && !cachedOnboarded);

  useEffect(() => {
    if (waiting || status !== 'signedIn') return;
    const onboarded = me.data?.onboarded ?? cachedOnboarded;
    router.replace(onboarded ? '/buddies' : FIRST_STEP);
  }, [cachedOnboarded, me.data?.onboarded, router, status, waiting]);

  if (status === 'signedIn') return <LoadingScreen />;

  return <>{children}</>;
}

/**
 * The signup questionnaire's only guard.
 *
 * `RequireSession` cannot be used there: these screens run *before* an account
 * exists, so the state it exists to reject — no session — is the normal case.
 * The one person who should not be here is someone who already finished
 * onboarding and typed the URL, or followed a stale link.
 *
 * A signed-in but unonboarded user is deliberately let through, because these
 * are the screens that would finish the job. That covers a mobile signup
 * continuing on the web, and anyone who abandoned the flow and came back.
 */
export function RedirectIfOnboarded() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const cachedOnboarded = useSession((s) => s.onboarded);
  const me = useMe();

  const onboarded = me.data?.onboarded ?? cachedOnboarded;

  useEffect(() => {
    if (status === 'signedIn' && onboarded) router.replace('/buddies');
  }, [onboarded, router, status]);

  return null;
}
