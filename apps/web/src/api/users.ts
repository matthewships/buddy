import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';

/**
 * The student half of a profile, as three endpoints all return it: `/me`, the
 * public profile, and each card in the directory. Declared once so the profile
 * view can render any of them without three near-identical interfaces drifting
 * apart.
 */
export interface StudentFields {
  educationLevel: string | null;
  institution: string | null;
  majorKey: string | null;
  majorText: string | null;
  country: string | null;
  city: string | null;
  bio: string | null;
  topics: string[];
  interests: string[];
  /** The word behind a `custom` interest, so `Other` never renders as "Other". */
  interestText: string | null;
}

export interface PublicProfile extends StudentFields {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  goalKey: string | null;
  goalKey2: string | null;
  goalText: string | null;
  occupationKey: string | null;
  occupationText: string | null;
  isOpenBuddy: boolean;
  memberSince: string;
  lastSeenAt: string | null;
  stats: {
    totalCredits: number;
    currentStreak: number;
    bestStreak: number;
    tasksApproved: number;
    reviewsGiven: number;
  };
  badges: { key: string; name: string; description: string; emoji: string; awardedAt: string }[];
  buddyProfile: {
    headline: string | null;
    about: string | null;
    availability: string | null;
    checkinStyle: string | null;
  } | null;
}

export interface BlockedUser {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  blockedAt: string;
}

export const blockKeys = { list: ['me', 'blocks'] as const };

/** Everyone the caller has blocked, for the settings list that undoes it. */
export function useBlocks(enabled = true) {
  return useQuery({
    queryKey: blockKeys.list,
    enabled,
    queryFn: async () => unwrap<{ blocks: BlockedUser[] }>(await api.api.me.blocks.$get()),
  });
}

/**
 * Blocking somebody (PRODUCT.md §6.1). Everything that lists people is
 * invalidated, because a block changes all of it at once: the directory, the
 * feed, every group and every chat history.
 */
export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (handle: string) =>
      unwrap<{ blocked: true; leftGroups: number }>(
        await api.api.users[':handle'].block.$post({ param: { handle } }),
      ),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (handle: string) =>
      unwrap<{ blocked: false }>(await api.api.users[':handle'].block.$delete({ param: { handle } })),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}

export function useProfile(handle: string) {
  return useQuery({
    queryKey: ['profile', handle],
    enabled: handle.length > 0,
    queryFn: async () =>
      unwrap<PublicProfile>(await api.api.users[':handle'].$get({ param: { handle } })),
  });
}
