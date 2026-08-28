'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {
  buddyKeys,
  REQUEST_TTL_MS,
  useIncomingRequests,
  type PendingRequest,
} from '@/api/buddies';

import { notificationsArmed } from './useNotificationPreference';

/**
 * Browser notifications for incoming buddy requests.
 *
 * The API pushes through Expo, which no browser can receive, so the web client
 * has no push at all. What it does have is the 15-second poll in
 * `useIncomingRequests`, which exists because a request expires in 5 minutes and
 * push may be denied or undelivered. This turns that poll's *new* rows into a
 * real notification, using nothing but the Notifications API.
 *
 * What that buys, stated honestly:
 *
 * - It only works **while a tab is open**. There is no service worker here, so
 *   nothing arrives once the browser is closed or the tab is gone.
 * - `new Notification()` is **unsupported on Android Chrome**, where the only
 *   route is a service worker registration's `showNotification`. So this is
 *   effectively desktop-first; on Android the constructor throws and the app
 *   falls back to the on-screen banner, exactly as before.
 */

/** Matches the poll in `useIncomingRequests` — see the background-tick comment below. */
const POLL_MS = 15_000;

export function useRequestNotifications(): void {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Free to call again: TanStack Query dedupes by query key, so this observer
  // shares the cache entry and the in-flight request with the buddies screen's
  // own `useIncomingRequests()`. No extra network traffic on top of the poll.
  const { data } = useIncomingRequests();

  /**
   * Request ids already accounted for. `null` means "no payload seen yet", which
   * is what keeps a pending request that was *already* waiting when the app
   * opened from firing a stale banner: the first resolved payload is adopted as
   * the baseline and notifies nothing.
   *
   * Ids are never removed. A responded-to or expired request leaves the incoming
   * list for good and its id is never reissued, so the set grows only with real
   * arrivals — and keeping them means a poll that briefly flickers a row out and
   * back cannot re-notify.
   *
   * The cache is persisted to `localStorage`, so on a cold start that baseline
   * can be the previous session's rows and the first fresh fetch may count a
   * request that was already waiting as an arrival. Harmless in practice: the
   * visibility gate below means that only matters for a tab that was opened and
   * immediately backgrounded, and a 5-minute request is worth telling them about
   * either way.
   */
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const requests = data?.requests;
    if (!requests) return;

    if (seen.current === null) {
      seen.current = new Set(requests.map((request) => request.id));
      return;
    }

    const known = seen.current;
    const arrivals = requests.filter((request) => !known.has(request.id));
    for (const request of requests) known.add(request.id);

    if (arrivals.length === 0) return;
    // Only when the user is looking elsewhere. With the app in front,
    // `RequestBanner` is already on screen and a notification is pure noise.
    // Marking arrivals seen above (before this check) means returning to the tab
    // does not then fire a banner for something already visible.
    //
    // "Looking" needs both halves. `visibilityState` alone is what this
    // originally tested, and it is wrong: a tab is `visible` whenever it is the
    // selected tab of its window, *even if that window is behind another
    // application*. Buddy parked in a second window while you work in the first
    // is the ordinary case, and it produced no notification at all — the
    // arrival was marked seen and silently dropped. `document.hasFocus()` is
    // what distinguishes the two.
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    if (!notificationsArmed()) return;

    for (const request of arrivals) notify(request, () => router.push('/buddies'));
  }, [data, router]);

  useEffect(() => {
    /*
     * The poll that feeds this hook stops exactly when the hook needs it.
     *
     * TanStack Query's interval refetch is skipped unless
     * `refetchIntervalInBackground` is set or `focusManager.isFocused()` is true,
     * and that focus check is `document.visibilityState !== 'hidden'`. So a
     * hidden tab never refetches, and without this tick nothing would arrive to
     * notify about. Rather than change the shared query's options, drive the
     * refetch here while hidden.
     *
     * The gate stays `hidden` — deliberately *not* the wider "not looking" test
     * the notify path uses — because it is the exact complement of
     * `focusManager`'s. `focusManager` subscribes to `visibilitychange` only and
     * never to blur, so an unfocused-but-visible window keeps polling on the
     * query's own interval. The two therefore tile the states exactly: visible
     * (focused or not) the query fetches, hidden this tick does, and neither
     * runs twice. One request per 15 seconds throughout.
     *
     * The gates are re-read inside the tick, not around it, so enabling
     * notifications in Profile takes effect without a remount, and a tab that is
     * not armed adds no background traffic at all.
     */
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') return;
      if (!notificationsArmed()) return;
      void queryClient.refetchQueries({ queryKey: buddyKeys.incoming });
    }, POLL_MS);

    return () => clearInterval(id);
  }, [queryClient]);
}

/** Wording tracks `RequestBanner`, so the notification and the screen agree. */
function notify(request: PendingRequest, goToBuddies: () => void): void {
  const minutes = Math.round(REQUEST_TTL_MS / 60_000);
  const goal = request.user.goalText?.trim();

  try {
    const notification = new window.Notification(
      `${request.user.displayName} wants you as a buddy`,
      {
        body: `@${request.user.handle}${goal ? ` · ${goal}` : ''} — respond within ${minutes} minutes.`,
        // Collapses duplicates: several hidden tabs of the same app would
        // otherwise each raise their own banner for one request.
        tag: `buddy-request:${request.id}`,
      },
    );

    notification.onclick = () => {
      // Bring the tab forward and land on the screen where accept and decline
      // actually live; the notification has no buttons of its own.
      window.focus();
      notification.close();
      goToBuddies();
    };
  } catch {
    // Android Chrome throws here: the constructor requires a service worker
    // registration's `showNotification`, which this app deliberately does not
    // have. Nothing to report to the user — the in-app banner still appears.
  }
}

/**
 * Mounted by the tabs layout so the watch is alive on every tab, not only on the
 * buddies screen. Renders nothing; it exists because a layout is a server
 * component and cannot call hooks itself.
 */
export function RequestNotifications(): null {
  useRequestNotifications();
  return null;
}
