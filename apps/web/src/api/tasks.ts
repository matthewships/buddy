import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from './client';
import { meQueryKey } from './auth';

export type TaskStatus = 'planned' | 'done' | 'proof_requested' | 'approved' | 'missed';

export interface Task {
  id: string;
  userId: string;
  groupId: string;
  title: string;
  notes: string | null;
  dueDate: string;
  status: TaskStatus;
  proofText: string | null;
  proofImageKey: string | null;
  doneAt: string | null;
  createdAt: string;
  ownerHandle: string;
  ownerDisplayName: string;
  groupName: string;
}

export interface TaskReview {
  id: string;
  action: 'approve' | 'request_proof';
  rating: number | null;
  comment: string | null;
  createdAt: string;
  reviewerHandle: string;
  reviewerDisplayName: string;
}

export interface Award {
  credits: number;
  dailyBonus: number;
  streak: number;
  badges: string[];
}

export const taskKeys = {
  mine: (date: string) => ['tasks', 'mine', date] as const,
  review: ['tasks', 'review'] as const,
  group: (groupId: string) => ['tasks', 'group', groupId] as const,
  reviews: (taskId: string) => ['tasks', taskId, 'reviews'] as const,
};

/** The local calendar day, which is the unit a task is planned for (§2.4). */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export function useMyTasks(date: string) {
  return useQuery({
    queryKey: taskKeys.mine(date),
    queryFn: async () =>
      unwrap<{ tasks: Task[] }>(await api.api.tasks.$get({ query: { date, scope: 'mine' } })),
  });
}

/** Buddies' tasks awaiting a review, across every group (§2.4). */
export function useReviewQueue() {
  return useQuery({
    queryKey: taskKeys.review,
    queryFn: async () =>
      unwrap<{ tasks: Task[] }>(await api.api.tasks.$get({ query: { scope: 'review' } })),
  });
}

/**
 * Every member's tasks in one group, for the group board. `scope: 'mine'` with a
 * groupId would return only the caller's, so this uses the review scope's
 * cross-member view constrained to the group — the API filters by membership.
 */
export function useGroupTasks(groupId: string) {
  return useQuery({
    queryKey: taskKeys.group(groupId),
    enabled: groupId.length > 0,
    queryFn: async () =>
      unwrap<{ tasks: Task[] }>(
        await api.api.tasks.$get({ query: { groupId, scope: 'all' } as never }),
      ),
  });
}

export function useTaskReviews(taskId: string, enabled = true) {
  return useQuery({
    queryKey: taskKeys.reviews(taskId),
    enabled: enabled && taskId.length > 0,
    queryFn: async () =>
      unwrap<{ reviews: TaskReview[] }>(
        await api.api.tasks[':id'].reviews.$get({ param: { id: taskId } }),
      ),
  });
}

/**
 * Invalidates everything an approval can move: the owner's day, the review
 * queue, and /me (credits, streak and badges are shown on the profile).
 */
function useTaskInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: meQueryKey });
  };
}

export function useCreateTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      title: string;
      notes?: string;
      dueDate: string;
    }) => unwrap<{ task: Task }>(await api.api.tasks.$post({ json: input })),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; title?: string; notes?: string | null }) =>
      unwrap<{ task: Task }>(
        await api.api.tasks[':id'].$patch({ param: { id }, json: patch as never }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ ok: true }>(await api.api.tasks[':id'].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useMarkDone() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async ({ id, proofText }: { id: string; proofText?: string }) =>
      unwrap<{ task: Task }>(
        await api.api.tasks[':id'].done.$post({
          param: { id },
          json: proofText ? { proofText } : {},
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useSubmitProof() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async ({ id, proofText }: { id: string; proofText: string }) =>
      unwrap<{ task: Task }>(
        await api.api.tasks[':id'].proof.$post({ param: { id }, json: { proofText } }),
      ),
    onSuccess: invalidate,
  });
}

export function useReviewTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async ({
      id,
      ...review
    }:
      | { id: string; action: 'approve'; rating: number; comment?: string }
      | { id: string; action: 'request_proof'; comment?: string }) =>
      unwrap<{ task: Task; award: Award | null }>(
        await api.api.tasks[':id'].review.$post({ param: { id }, json: review as never }),
      ),
    onSuccess: invalidate,
  });
}
