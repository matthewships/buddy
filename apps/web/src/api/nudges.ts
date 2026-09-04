import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';
import { sessionKeys } from './sessions';
import { taskKeys } from './tasks';

/**
 * Pressure (PRODUCT.md §3.3): a groupmate's nudge, a check-in the owner asks
 * for, and the reply. All templated; nothing here carries free text.
 */
export interface TaskNudge {
  id: string;
  kind: 'start' | 'buddy' | 'checkin' | 'checkin_reply';
  template: string | null;
  fromUserId: string | null;
  toUserId: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  fromDisplayName: string | null;
}

export const nudgeKeys = {
  task: (taskId: string) => ['nudges', 'task', taskId] as const,
};

export function useTaskNudges(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: nudgeKeys.task(taskId),
    enabled: enabled && taskId.length > 0,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async () =>
      unwrap<{ nudges: TaskNudge[] }>(await api.api.tasks[':id'].nudges.$get({ param: { id: taskId } })),
  });
}

export function useNudgeTask(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: string) =>
      unwrap<{ id: string; template: string }>(
        await api.api.tasks[':id'].nudge.$post({ param: { id: taskId }, json: { template: template as never } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nudgeKeys.task(taskId) }),
  });
}

export function useRequestCheckin(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { buddyUserId: string; at: string }) =>
      unwrap<{ id: string; at: string }>(
        await api.api.tasks[':id'].checkin.$post({ param: { id: taskId }, json: input }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nudgeKeys.task(taskId) }),
  });
}

export function useReplyCheckin(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nudgeId: string; template: string }) =>
      unwrap<{ id: string; template: string }>(
        await api.api.nudges[':id'].reply.$post({
          param: { id: input.nudgeId },
          json: { template: input.template as never },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nudgeKeys.task(taskId) }),
  });
}

/** Nudging somebody who committed to a session and has not arrived. */
export function useNudgeParticipant(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; userId: string; template: string }) =>
      unwrap<{ id: string; template: string }>(
        await api.api.sessions[':id'].nudge[':userId'].$post({
          param: { id: input.sessionId, userId: input.userId },
          json: { template: input.template as never },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.current(groupId) }),
  });
}

/** Keeps the group's task list current after a check-in reply, which the owner reads there. */
export function useInvalidateGroupTasks(groupId: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: taskKeys.group(groupId) });
}
