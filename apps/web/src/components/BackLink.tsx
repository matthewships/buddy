'use client';

import { useRouter } from 'next/navigation';

/**
 * A back affordance for the pushed screens.
 *
 * The Expo app sets `headerShown: false` and relies on the native stack — the
 * hardware button on Android, the edge swipe on iOS. A browser has a back button
 * of its own, but nothing on the page points at it, and these routes are
 * reachable by direct link with no history to go back to. So the control is
 * explicit, and falls back to a sensible parent rather than `router.back()`
 * when this is the first entry in the session's history.
 */
export function BackLink({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.replace(fallback);
      }}
      className="flex w-fit cursor-pointer flex-row items-center gap-1 py-2 text-sm font-semibold text-brand hover:opacity-80"
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
