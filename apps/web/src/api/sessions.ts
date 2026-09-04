import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, unwrap } from './client';
import { groupKeys } from './groups';
import { taskKeys } from './tasks';

/**
 * Group sessions (PRODUCT.md §3.1): one clock for the room.
 *
 * The group's current session is polled rather than pushed: it changes a few
 * times an hour at most, the screen it is on is already polling for tasks,
 * and a socket for it would be a second connection to keep alive for a value
 * that a thirty-second refetch delivers well enough.
 */
export type SessionState = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type ParticipantState = 'committed' | 'present' | 'late' | 'no_show' | 'left_early' | 'completed';

export interface Session {
  id: string;
  groupId: string;
  hostId: string;
  kind: 'solo' | 'group';
  state: SessionState;
  plannedMinutes: number;
  breakMinutes: number;
  scheduledFor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface SessionParticipant {
  userId: string;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  state: ParticipantState;
  joinedAt: string | null;
  lastSeenAt: string | null;
  presentMinutes: number;
}

export interface SessionView {
  session: Session | null;
  participants: SessionParticipant[];
  tasks: { taskId: string; minutes: number; userId: string; title: string }[];
  serverNow: string;
}

export const sessionKeys = {
  current: (groupId: string) => ['sessions', 'current', groupId] as const,
};

export function useCurrentSession(groupId: string) {
  return useQuery({
    queryKey: sessionKeys.current(groupId),
    enabled: groupId.length > 0,
    refetchInterval: 30_000,
    queryFn: async () =>
      unwrap<SessionView>(
        await api.api.groups[':id'].sessions.current.$get({ param: { id: groupId } }),
      ),
  });
}

function useSessionInvalidation(groupId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: sessionKeys.current(groupId) });
    // Joining with a task starts its clock; ending settles every clock.
    void queryClient.invalidateQueries({ queryKey: taskKeys.group(groupId) });
    void queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
  };
}

export function useCreateSession(groupId: string) {
  const invalidate = useSessionInvalidation(groupId);
  return useMutation({
    mutationFn: async (input: { plannedMinutes: number; scheduledFor?: string; taskId?: string }) =>
      unwrap<SessionView>(
        await api.api.groups[':id'].sessions.$post({
          param: { id: groupId },
          json: { breakMinutes: 0, ...input },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useJoinSession(groupId: string) {
  const invalidate = useSessionInvalidation(groupId);
  return useMutation({
    mutationFn: async (input: { sessionId: string; taskId?: string }) =>
      unwrap<SessionView>(
        await api.api.sessions[':id'].join.$post({
          param: { id: input.sessionId },
          json: input.taskId ? { taskId: input.taskId } : {},
        }),
      ),
    onSuccess: invalidate,
  });
}

function useSessionAction(groupId: string, action: 'leave' | 'start' | 'end' | 'cancel') {
  const invalidate = useSessionInvalidation(groupId);
  return useMutation({
    mutationFn: async (sessionId: string) =>
      unwrap<SessionView>(await api.api.sessions[':id'][action].$post({ param: { id: sessionId } })),
    onSuccess: invalidate,
  });
}

export const useLeaveSession = (groupId: string) => useSessionAction(groupId, 'leave');
export const useStartSession = (groupId: string) => useSessionAction(groupId, 'start');
export const useEndSession = (groupId: string) => useSessionAction(groupId, 'end');
export const useCancelSession = (groupId: string) => useSessionAction(groupId, 'cancel');

/**
 * Presence. While the viewer is present in a live session, the client beats
 * once a minute; a client that stops beating — tab closed, laptop shut — is
 * simply not present, and nothing else has to notice.
 */
export function useHeartbeat(sessionId: string | null, active: boolean) {
  useEffect(() => {
    if (!sessionId || !active) return;
    const beat = () => void api.api.sessions[':id'].heartbeat.$post({ param: { id: sessionId } });
    beat();
    const timer = setInterval(beat, 60_000);
    return () => clearInterval(timer);
  }, [sessionId, active]);
}

/** Rest days and freezes (PRODUCT.md §3.6). */
export interface RestDays {
  today: string;
  restDays: string[];
  spentByFreeze: string[];
  usedThisWeek: number;
  maxPerWeek: number;
  freezesAvailable: number;
}

export const restDayKeys = { all: ['me', 'rest-days'] as const };

export function useRestDays(enabled = true) {
  return useQuery({
    queryKey: restDayKeys.all,
    enabled,
    queryFn: async () => unwrap<RestDays>(await api.api.me['rest-days'].$get()),
  });
}

export function useDeclareRestDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date: string; declared: boolean }) =>
      input.declared
        ? unwrap<{ date: string; declared: true }>(
            await api.api.me['rest-days'].$put({ json: { date: input.date } }),
          )
        : unwrap<{ date: string; declared: false }>(
            await api.api.me['rest-days'][':date'].$delete({ param: { date: input.date } }),
          ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: restDayKeys.all }),
  });
}
