import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { BUDDY_REQUEST_TTL_MS } from '@buddy/shared';

import { api, unwrap } from './client';
import { setClockOffset } from '@/hooks/useCountdown';

export interface BuddyCard {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  goalKey: string | null;
  goalText: string | null;
  occupationKey: string | null;
  occupationText: string | null;
  headline: string | null;
  activity: string;
  stats: { totalCredits: number; currentStreak: number; reviewsGiven: number };
}

export interface DirectoryFilters {
  goal?: string;
  occupation?: string;
  activeOnly?: boolean;
}

export const buddyKeys = {
  directory: (filters: DirectoryFilters) => ['buddies', filters] as const,
  current: ['buddy-request', 'current'] as const,
  incoming: ['buddy-request', 'incoming'] as const,
};

export function useBuddyDirectory(filters: DirectoryFilters) {
  return useInfiniteQuery({
    queryKey: buddyKeys.directory(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap<{ buddies: BuddyCard[]; nextCursor: string | null }>(
        await api.api.buddies.$get({
          query: {
            ...(filters.goal ? { goal: filters.goal } : {}),
            ...(filters.occupation ? { occupation: filters.occupation } : {}),
            ...(filters.activeOnly ? { activeOnly: 'true' } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          } as never,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export interface PendingRequest {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  expiresAt: string;
  serverNow: string;
  user: {
    id: string;
    handle: string;
    displayName: string;
    avatarKey: string | null;
    goalKey: string | null;
    goalText: string | null;
  };
}

export interface RequestOutcome {
  status: string;
  respondedAt: string | null;
  user: PendingRequest['user'] | null;
  group: { id: string; name: string } | null;
}

/**
 * Polls the requester's own pending request every 5 seconds (§4.5).
 *
 * The poll does double duty: it keeps the countdown honest against server time,
 * and it is how the requester learns they were accepted. Polling stops once
 * there is nothing pending and no fresh outcome, so an idle app is quiet.
 */
export function useCurrentRequest(enabled = true) {
  return useQuery({
    queryKey: buddyKeys.current,
    enabled,
    refetchInterval: (query) => (query.state.data?.request ? 5000 : false),
    queryFn: async () => {
      const body = await unwrap<{ request: PendingRequest | null; outcome: RequestOutcome | null }>(
        await api.api['buddy-requests'].current.$get(),
      );
      // Measure the device's clock offset from the server's, so the countdown
      // is right even on a phone whose clock is minutes out.
      if (body.request) {
        setClockOffset(Date.parse(body.request.serverNow) - Date.now());
      }
      return body;
    },
  });
}

/** Requests addressed to me, for the accept/decline banner. */
export function useIncomingRequests(enabled = true) {
  return useQuery({
    queryKey: buddyKeys.incoming,
    enabled,
    // A 5-minute window is useless if the banner appears late, and push may be
    // denied or undelivered, so this polls as a floor on responsiveness.
    refetchInterval: 15_000,
    queryFn: async () =>
      unwrap<{ requests: PendingRequest[] }>(
        await api.api['buddy-requests'].incoming.$get(),
      ),
  });
}

export function useSendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { toUserId: string; message?: string }) =>
      unwrap<{ id: string; expiresAt: string; serverNow: string }>(
        await api.api['buddy-requests'].$post({ json: input }),
      ),
    onSuccess: (created) => {
      setClockOffset(Date.parse(created.serverNow) - Date.now());
      void queryClient.invalidateQueries({ queryKey: buddyKeys.current });
    },
  });
}

export function useRespondToRequest() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: buddyKeys.incoming });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  return {
    accept: useMutation({
      mutationFn: async (id: string) =>
        unwrap<{ group: { id: string; name: string } }>(
          await api.api['buddy-requests'][':id'].accept.$post({ param: { id } }),
        ),
      onSuccess: invalidate,
    }),
    decline: useMutation({
      mutationFn: async (id: string) =>
        unwrap<{ ok: true }>(
          await api.api['buddy-requests'][':id'].decline.$post({ param: { id } }),
        ),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: async (id: string) =>
        unwrap<{ ok: true }>(
          await api.api['buddy-requests'][':id'].cancel.$post({ param: { id } }),
        ),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: buddyKeys.current }),
    }),
  };
}

export const REQUEST_TTL_MS = BUDDY_REQUEST_TTL_MS;
