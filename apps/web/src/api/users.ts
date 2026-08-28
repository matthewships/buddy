import { useQuery } from '@tanstack/react-query';

import { api, unwrap } from './client';

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  goalKey: string | null;
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

export function useProfile(handle: string) {
  return useQuery({
    queryKey: ['profile', handle],
    enabled: handle.length > 0,
    queryFn: async () =>
      unwrap<PublicProfile>(await api.api.users[':handle'].$get({ param: { handle } })),
  });
}
