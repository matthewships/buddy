import { AppFrame, RequireSession, TabBar } from '@/components';
import { RequestNotifications } from '@/hooks/useRequestNotifications';

/**
 * The tab shell. The bar is the last child of the column and `sticky`, so it
 * stays on screen while the content above it scrolls — the same result as a
 * native tab bar, without taking the content out of the document flow.
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
