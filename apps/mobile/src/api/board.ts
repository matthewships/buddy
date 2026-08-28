import { useMutation, useQuery } from '@tanstack/react-query';

import { api, unwrap } from './client';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  credits: number;
  currentStreak: number;
}

export type LeaderboardScope = 'weekly' | 'alltime';

export function useLeaderboard(scope: LeaderboardScope) {
  return useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: async () =>
      unwrap<{
        scope: LeaderboardScope;
        entries: LeaderboardEntry[];
        generatedAt: string;
        me: { rank: number | null; credits: number };
      }>(await api.api.leaderboard.$get({ query: { scope } })),
    // The server serves a snapshot refreshed every 5 minutes, so polling faster
    // than that would just re-fetch the same bytes.
    staleTime: 60_000,
  });
}

export function useReport() {
  return useMutation({
    mutationFn: async (input: {
      targetType: 'task' | 'message' | 'user';
      targetId: string;
      reason: string;
      note?: string;
    }) =>
      unwrap<{ ok: true; alreadyReported: boolean }>(
        await api.api.reports.$post({ json: input }),
      ),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () =>
      unwrap<{ ok: true; alreadyDeleted: boolean }>(await api.api.me.$delete()),
  });
}
