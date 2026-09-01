import { AppFrame, NotificationBell, RequireSession, TabBar } from '@/components';
import { RequestNotifications } from '@/hooks/useRequestNotifications';

/**
 * The tab shell. The bar is the last child of the column and `sticky`, so it
 * stays on screen while the content above it scrolls — the same result as a
 * native tab bar, without taking the content out of the document flow.
 *
 * The bell is the other half of that: the tab bar says where you can go, and
 * the bell says where you are needed. It sits in a strip of its own rather than
 * inside each screen's heading row, because it belongs to the app rather than
 * to any one tab, and it has to be in the same place on all five.
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
        <div className="sticky top-0 z-40 flex flex-row justify-end border-b border-surface-border bg-surface/90 px-5 py-2 backdrop-blur">
          <NotificationBell />
        </div>
        <div className="flex flex-1 flex-col">{children}</div>
        <TabBar />
      </RequireSession>
    </AppFrame>
  );
}
