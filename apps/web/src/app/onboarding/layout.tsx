import { AppFrame, RequireSession } from '@/components';

/**
 * The onboarding stack. `requireOnboarded={false}` is the point: these screens
 * are for a signed-in user who has *not* finished onboarding, so the guard has
 * to admit exactly the state every other signed-in route redirects away from.
 *
 * Unlike the Expo app these screens live under a real `/onboarding` path
 * segment. Next hides route groups from the URL just as Expo Router does, so
 * `(onboarding)/profile` and `(tabs)/profile` would both have resolved to
 * `/profile` and failed the build.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <RequireSession requireOnboarded={false}>{children}</RequireSession>
    </AppFrame>
  );
}
