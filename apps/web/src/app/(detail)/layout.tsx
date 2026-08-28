import { AppFrame, RequireSession } from '@/components';
import { RequestNotifications } from '@/hooks/useRequestNotifications';

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
      <RequireSession>
        {/*
          Mounted here as well as in the tabs layout, because these routes are a
          sibling group rather than a child of it: without this, walking into a
          group or a chat unmounted the request watch and notifications simply
          stopped until the user navigated back to a tab. Two lines in two
          layouts is the honest cost of the tab bar living in only one of them.
        */}
        <RequestNotifications />
        {children}
      </RequireSession>
    </AppFrame>
  );
}
