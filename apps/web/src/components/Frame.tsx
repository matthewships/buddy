import type { ReactNode } from 'react';

/**
 * The app frame.
 *
 * Buddy is a phone app, and "exactly similar" on a 27-inch monitor means a
 * phone-width column rather than five tabs stretched across 2000px. Every
 * layout wraps its children in this, so the column and the app background are
 * defined once.
 *
 * `min-h-dvh` rather than `min-h-screen`: on mobile browsers `100vh` includes
 * the address bar that is about to slide away, which leaves the bottom tab bar
 * cut off until the user scrolls.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-surface-muted">
      {children}
    </div>
  );
}

/**
 * Standard page frame: the app padding, matching apps/mobile's Screen. The safe
 * -area insets that component asks for are handled by the browser here, so only
 * the padding survives the port.
 */
export function Screen({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col gap-3 px-5 pb-8 pt-3">{children}</div>;
}
