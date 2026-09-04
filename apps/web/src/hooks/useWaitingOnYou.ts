'use client';

import { useIncomingRequests } from '@/api/buddies';
import { useInvites } from '@/api/groups';
import { useReviewQueue } from '@/api/tasks';

/**
 * Everything waiting on a decision from you, in one place.
 *
 * Two things read this — the count on the Profile tab and the panel that lists
 * the items — and they must never disagree, because a tab badge saying 3 above
 * a panel showing 2 makes the user hunt for a notification that was never
 * there. So the arithmetic lives here rather than in either of them.
 *
 * Deliberately built on queries the app already runs rather than on a
 * notifications table. Every item is a *pending decision* some screen is
 * already fetching, so this costs no extra requests, cannot drift out of sync
 * with the screens it summarises, and empties itself when the work is done. A
 * stored feed of past events — "Ana approved your task" — is a different
 * feature that needs a table; this is not a cheap version of it, it is the
 * answer to "what needs me right now".
 *
 * React Query dedupes by key, so mounting this in both the tab bar and the
 * panel costs one set of requests, not two.
 */
export function useWaitingOnYou() {
  const invites = useInvites();
  const requests = useIncomingRequests();
  const reviews = useReviewQueue();

  const inviteList = invites.data?.invites ?? [];
  const requestList = requests.data?.requests ?? [];
  const reviewList = reviews.data?.tasks ?? [];

  return {
    invites: inviteList,
    requests: requestList,
    reviews: reviewList,
    count: inviteList.length + requestList.length + reviewList.length,
  };
}
