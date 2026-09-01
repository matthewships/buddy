import { AppFrame } from '@/components';

/**
 * The join link's shell, and the only stack in the app with no guard at all.
 *
 * That absence is the point, and it is why this route does not live under
 * `(intro)` with the questionnaire it feeds. `(intro)` mounts
 * `RedirectIfOnboarded`, which sends any signed-in, onboarded user to
 * `/buddies` — and an onboarded user following a friend's invite is the single
 * most common way this link is ever opened. The screen that exists to let
 * someone accept an invitation cannot be one that redirects the majority of the
 * people who open it.
 *
 * Every other state is handled on the page rather than at the door: signed out
 * goes to the questions, signed in but unonboarded finishes onboarding first,
 * and signed in and onboarded joins in one tap.
 */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
