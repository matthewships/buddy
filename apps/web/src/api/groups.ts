import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { LeaderboardEntry, LeaderboardScope } from './board';

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string | null;
  kind: 'friends' | 'matched';
  createdAt: string;
  role: 'owner' | 'member';
  memberCount: number;
}

/** The group detail carries the two review roles; the list does not. */
export interface GroupDetail extends GroupSummary {
  /** Whoever made the group. Only they, or the Buddy, may change the Buddy. */
  createdBy: string;
  buddyUserId: string | null;
  buddyVerifierId: string | null;
}

export interface GroupMember {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  goalKey: string | null;
  goalText: string | null;
  role: 'owner' | 'member';
  joinedAt: string;
  lastSeenAt: string | null;
  /**
   * Today's status (§2.6), already expired against that member's own local day
   * by the server — a group spans timezones, and the client has no business
   * deciding whose midnight has passed.
   */
  statusKey: string | null;
}

export interface GroupInvite {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  groupId: string;
  groupName: string;
  groupEmoji: string | null;
  fromHandle: string;
  fromDisplayName: string;
}

export const groupKeys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
  invites: ['invites'] as const,
  standings: (id: string, scope: LeaderboardScope) => ['groups', id, 'standings', scope] as const,
};

export function useGroups() {
  return useQuery({
    queryKey: groupKeys.all,
    queryFn: async () => unwrap<{ groups: GroupSummary[] }>(await api.api.groups.$get()),
  });
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: groupKeys.detail(id),
    enabled: id.length > 0,
    queryFn: async () =>
      unwrap<{ group: GroupDetail; members: GroupMember[] }>(
        await api.api.groups[':id'].$get({ param: { id } }),
      ),
  });
}

/**
 * This group's standings.
 *
 * Computed live on the server rather than snapshotted, so unlike the global
 * board there is no five-minute floor to respect here — a member who was
 * approved a minute ago should have moved by the time anyone looks.
 */
export function useGroupStandings(id: string, scope: LeaderboardScope, enabled = true) {
  return useQuery({
    queryKey: groupKeys.standings(id, scope),
    enabled: enabled && id.length > 0,
    queryFn: async () =>
      unwrap<{ scope: LeaderboardScope; entries: LeaderboardEntry[] }>(
        await api.api.groups[':id'].leaderboard.$get({ param: { id }, query: { scope } }),
      ),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; emoji?: string }) =>
      unwrap<{ group: { id: string; name: string } }>(await api.api.groups.$post({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useInviteToGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (handle: string) =>
      unwrap<{ id: string; handle: string }>(
        await api.api.groups[':id'].invites.$post({
          param: { id: groupId },
          json: { handle },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) =>
      unwrap<{ ok: true; groupDeleted: boolean }>(
        await api.api.groups[':id'].leave.$post({ param: { id: groupId } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useInvites() {
  return useQuery({
    queryKey: groupKeys.invites,
    /**
     * Polled, because the count on the Profile tab is built from this and is
     * now the only ambient sign that anything is waiting. Without an interval
     * the badge only moved when something else happened to invalidate the
     * query, so an invite that arrived while the app sat open stayed invisible
     * until the user reloaded. A minute is well inside the seven days an invite
     * lasts, and it is one small request.
     */
    refetchInterval: 60_000,
    queryFn: async () => unwrap<{ invites: GroupInvite[] }>(await api.api.invites.$get()),
  });
}

export function useRespondToInvite() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: groupKeys.invites });
    void queryClient.invalidateQueries({ queryKey: groupKeys.all });
  };

  return {
    accept: useMutation({
      mutationFn: async (id: string) =>
        unwrap<{ group: { id: string; name: string } | null }>(
          await api.api.invites[':id'].accept.$post({ param: { id } }),
        ),
      onSuccess: invalidate,
    }),
    decline: useMutation({
      mutationFn: async (id: string) =>
        unwrap<{ ok: true }>(await api.api.invites[':id'].decline.$post({ param: { id } })),
      onSuccess: invalidate,
    }),
  };
}

/**
 * Naming the group's Buddy and, when there is one, the member who verifies the
 * Buddy's own tasks. Any member may set this.
 */
export function useSetGroupBuddy(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { buddyUserId: string | null; verifierUserId?: string | null }) =>
      unwrap<{ buddyUserId: string | null; buddyVerifierId: string | null }>(
        await api.api.groups[':id'].buddy.$put({ param: { id: groupId }, json: input }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
  });
}

/** Mints a join link to send to someone who is not on Buddy yet. */
export function useCreateInviteLink(groupId: string) {
  return useMutation({
    mutationFn: async () =>
      unwrap<{ token: string; maxUses: number }>(
        await api.api.groups[':id']['invite-links'].$post({ param: { id: groupId } }),
      ),
  });
}
