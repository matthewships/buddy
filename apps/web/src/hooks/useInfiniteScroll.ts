'use client';

import { useEffect, useRef } from 'react';

/**
 * Replaces `FlatList`'s `onEndReached` / `onEndReachedThreshold`.
 *
 * An `IntersectionObserver` on a sentinel element after the last row, rather
 * than a scroll listener: the observer fires off the main thread and needs no
 * throttling, and the `rootMargin` is the equivalent of the mobile list's 0.4
 * threshold — it starts the next page while the sentinel is still below the
 * fold, so the list rarely shows a gap.
 *
 * Attach the returned ref to an element rendered after the last item.
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  { enabled }: { enabled: boolean },
): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so a new closure each render does not tear down the observer.
  const callbackRef = useRef(onLoadMore);
  callbackRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
      },
      { rootMargin: '300px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled]);

  return sentinelRef;
}
