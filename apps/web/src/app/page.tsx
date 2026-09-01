import type { Metadata } from 'next';

import { LandingPage, LandingRedirect } from '@/components';

/**
 * The entry route.
 *
 * apps/mobile/app/index.tsx is a pure switchboard — it picks a stack and
 * renders nothing itself, because a phone app has no visitors, only users. `/`
 * on the web is also the address someone types first, so it renders the landing
 * page directly instead of spending a load cycle showing a spinner and then
 * redirecting for the identical content.
 *
 * The stack decision for a *signed-in* visitor is unchanged and lives in
 * `LandingRedirect`, which takes the screen over as soon as it knows there is a
 * session. Signed out, nothing redirects: this is the page they wanted.
 *
 * **No `AppFrame` here, unlike every other route.** The frame is a phone-width
 * column, which is right for an app that is a phone app and wrong for the one
 * page whose job is to persuade somebody who has not signed up. `LandingPage`
 * brings its own full-width layout, and `LandingRedirect`'s loading state
 * carries its own `min-h-dvh` background, so neither needs the column.
 *
 * `/welcome` keeps the compact `WelcomeScreen`: it is where `RequireSession`
 * sends somebody who has just been signed out, and answering that with a
 * marketing page would be a strange thing to do to a returning user.
 */
export const metadata: Metadata = {
  title: 'Buddy — accountability for students',
  description:
    'Plan what you will finish today, have a buddy approve it, and build the streak. Buddy pairs you with students working toward the same thing.',
};

export default function Index() {
  return (
    <LandingRedirect>
      <LandingPage />
    </LandingRedirect>
  );
}
