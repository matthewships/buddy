'use client';

import { Spinner } from './Spinner';

/**
 * Manual refresh, standing in for `<RefreshControl>`.
 *
 * Pull-to-refresh is not reimplemented: on a touch browser the same gesture is
 * already the browser's own reload, and hijacking it is how web apps end up
 * feeling broken. Desktop has no gesture at all. So the affordance becomes an
 * explicit control, and `refetchOnWindowFocus` (on for web, off for mobile —
 * see api/queryClient.ts) covers the common case of returning to a stale tab.
 */
export function RefreshButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Refresh"
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed"
    >
      {busy ? <Spinner size={14} /> : <span aria-hidden="true">↻</span>}
    </button>
  );
}
