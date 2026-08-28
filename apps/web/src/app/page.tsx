import { AppFrame, LandingRedirect, WelcomeScreen } from '@/components';

/**
 * The entry route.
 *
 * apps/mobile/app/index.tsx is a pure switchboard — it picks a stack and
 * renders nothing itself, because a phone app has no visitors, only users. `/`
 * on the web is also the address someone types first, so it renders the landing
 * screen directly instead of spending a load cycle showing a spinner and then
 * redirecting to /welcome for the identical content.
 *
 * The stack decision for a *signed-in* visitor is unchanged and now lives in
 * `LandingRedirect`, which takes the screen over as soon as it knows there is a
 * session. Signed out, nothing redirects any more: this is the page they wanted.
 *
 * `AppFrame` is applied here because the root layout has none — the route
 * groups each bring their own.
 */
export default function Index() {
  return (
    <AppFrame>
      <LandingRedirect>
        <WelcomeScreen />
      </LandingRedirect>
    </AppFrame>
  );
}
