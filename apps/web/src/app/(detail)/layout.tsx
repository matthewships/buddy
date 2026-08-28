import { AppFrame, RequireSession } from '@/components';

/**
 * The pushed screens: a buddy's profile, a group, a group's chat.
 *
 * Deliberately outside the `(tabs)` group and therefore without the tab bar,
 * matching the Expo app, where these live outside `app/(tabs)` and are pushed
 * over it. Route groups are stripped from the URL, so `(tabs)/buddies` still
 * serves /buddies while `(detail)/buddies/[handle]` serves /buddies/:handle.
 */
export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <RequireSession>{children}</RequireSession>
    </AppFrame>
  );
}
