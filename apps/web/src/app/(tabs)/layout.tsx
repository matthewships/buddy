import { AppFrame, RequireSession, TabBar } from '@/components';
import { RequestNotifications } from '@/hooks/useRequestNotifications';

/**
 * The tab shell. The bar is the last child of the column and `sticky`, so it
 * stays on screen while the content above it scrolls — the same result as a
 * native tab bar, without taking the content out of the document flow.
 *
 * There used to be a second sticky strip above the content, holding nothing but
 * the notification bell. It cost every one of the five screens a permanent band
 * of a phone-sized column for a control that is empty most of the time. The
 * count moved onto the Profile tab, which is on screen anyway, and the panel
 * itself opens from the profile screen.
 */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <RequireSession>
        {/*
          Inside the gate, so the request watch only runs for a signed-in,
          onboarded user — and at the shell level, so it stays mounted while the
          user moves between tabs instead of only on the buddies screen.
        */}
        <RequestNotifications />
        <div className="flex flex-1 flex-col">{children}</div>
        <TabBar />
      </RequireSession>
    </AppFrame>
  );
}
