import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getAccessToken } from '@/auth/session';

import { API_URL, api, unwrap } from './client';
import { meQueryKey } from './auth';

export type TaskStatus = 'planned' | 'done' | 'proof_requested' | 'approved' | 'missed';

export interface Task {
  id: string;
  userId: string;
  groupId: string;
  title: string;
  notes: string | null;
  dueDate: string;
  /** How long the owner said it would take; null on tasks the app created. */
  estimatedMinutes: number | null;
  /** When the clock was started, or null when it is not running. */
  startedAt: string | null;
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
  return localDay(new Date());
}

/** Tomorrow, locally — where "Not today" puts a task. */
export function localTomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDay(date);
}

/**
 * A `Date` as the API's local-date string. Built from the local getters rather
 * than `toISOString()`, which would hand back the UTC day — an evening in
 * Toronto is already tomorrow in UTC, and a task planned then would be dated a
 * day ahead of the day its owner is living in.
 */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
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
    /** Same reason as `useInvites`: the Profile tab's badge is built from this. */
    refetchInterval: 60_000,
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
      estimatedMinutes?: number;
    }) => unwrap<{ task: Task }>(await api.api.tasks.$post({ json: input })),
    onSuccess: invalidate,
  });
}

/**
 * Editing a task: renaming it, giving it more time, or moving it to another day.
 *
 * The API accepts these on a `missed` task as well as a planned one, and moving
 * a missed task to a day that has not passed is what makes it a plan again —
 * which is what "Not today" does.
 */
export function useUpdateTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      notes?: string | null;
      dueDate?: string;
      estimatedMinutes?: number;
    }) =>
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
    mutationFn: async ({
      id,
      proofText,
      proofImageKey,
    }: {
      id: string;
      proofText?: string;
      proofImageKey?: string;
    }) =>
      unwrap<{ task: Task }>(
        await api.api.tasks[':id'].done.$post({
          param: { id },
          json: {
            ...(proofText ? { proofText } : {}),
            ...(proofImageKey ? { proofImageKey } : {}),
          },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useSubmitProof() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async ({
      id,
      proofText,
      proofImageKey,
    }: {
      id: string;
      proofText: string;
      proofImageKey?: string;
    }) =>
      unwrap<{ task: Task }>(
        await api.api.tasks[':id'].proof.$post({
          param: { id },
          json: { proofText, ...(proofImageKey ? { proofImageKey } : {}) },
        }),
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

/**
 * A task is running when its clock has been started and it has not closed.
 * Both halves matter: a swept or finished task can still carry a start time,
 * and treating that as running would keep its owner locked out of chat.
 */
export function isRunning(task: Task): boolean {
  return task.startedAt !== null && (task.status === 'planned' || task.status === 'proof_requested');
}

/** Milliseconds left on a running task; negative once it has overrun. */
export function remainingMs(task: Task, now = Date.now()): number {
  if (!task.startedAt || task.estimatedMinutes === null) return 0;
  return Date.parse(task.startedAt) + task.estimatedMinutes * 60_000 - now;
}

export function useStartTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ task: Task }>(await api.api.tasks[':id'].start.$post({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useAbandonTask() {
  const invalidate = useTaskInvalidation();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ task: Task; credits: number }>(
        await api.api.tasks[':id'].abandon.$post({ param: { id } }),
      ),
    onSuccess: invalidate,
  });
}

/**
 * The proof photo, as a URL an `<img>` can use.
 *
 * **Why this is not just a `src`.** Every other image in the app is a plain
 * `<img src>` at `/api/media/...`, which works because that route is
 * unauthenticated. A proof is group-private and its route requires a bearer
 * token — and a browser will not attach an `Authorization` header to an
 * `<img>`. So the bytes are fetched here and handed to the tag as an object
 * URL, which is also why the API can answer `private, no-store` without the
 * image failing to display.
 *
 * `useEffect` rather than `useQuery`: an object URL is a resource with a
 * lifetime, and the revoke has to happen when this unmounts or the task
 * changes. A cache entry that outlives the component would leak one blob per
 * proof viewed, for the session.
 */
export function useProofImage(taskId: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch(`${API_URL}/api/tasks/${taskId}/proof-image`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;

        const blob = await response.blob();
        // The effect may have been torn down while the bytes were in flight;
        // creating the URL then would leak it with nothing left to revoke it.
        if (revoked) return;

        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // A proof that will not load is not worth an error screen over the
        // review it is attached to. The reviewer still has the text and the
        // "ask for proof" button.
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [taskId, enabled]);

  return url;
}
