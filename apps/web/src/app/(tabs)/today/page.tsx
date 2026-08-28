'use client';

import { useState } from 'react';

import { MAX_PROOF_TEXT, MAX_REVIEW_COMMENT, MAX_TASK_TITLE } from '@buddy/shared';

import { useGroups } from '@/api/groups';
import {
  localToday,
  useCreateTask,
  useDeleteTask,
  useMarkDone,
  useMyTasks,
  useReviewQueue,
  useReviewTask,
  useSubmitProof,
  type Task,
} from '@/api/tasks';
import {
  Button,
  Card,
  ErrorText,
  Field,
  RatingPicker,
  RefreshButton,
  ReportSheet,
  Screen,
  Spinner,
  TaskRow,
} from '@/components';

/**
 * The Today tab (§5.2) — the screen the product exists for.
 *
 * Two lists: the user's own tasks for their local day, and buddies' tasks
 * waiting on a review. The review queue is one request across all groups
 * (`?scope=review`), not one per group.
 */
export default function Today() {
  const date = localToday();
  const groups = useGroups();
  const mine = useMyTasks(date);
  const queue = useReviewQueue();

  const loading = mine.isPending || groups.isPending;

  return (
    <Screen>
      <div className="mb-1 mt-2 flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Today</h1>
        <RefreshButton
          busy={mine.isRefetching || queue.isRefetching}
          onClick={() => {
            void mine.refetch();
            void queue.refetch();
          }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-ink-subtle">
          <Spinner />
        </div>
      ) : (groups.data?.groups.length ?? 0) === 0 ? (
        <Card>
          <p className="text-base text-ink">You need a group before you can plan a day.</p>
          <p className="mt-1 text-sm text-ink-subtle">
            Find a buddy in the Buddies tab, or create a group and invite someone you know.
          </p>
        </Card>
      ) : (
        <>
          <AddTask date={date} />

          {(mine.data?.tasks.length ?? 0) === 0 ? (
            <Card>
              <p className="text-base text-ink">Nothing planned yet.</p>
              <p className="mt-1 text-sm text-ink-subtle">
                Write down what you&apos;ll finish today. Anything still planned at midnight is
                marked missed.
              </p>
            </Card>
          ) : (
            mine.data?.tasks.map((task) => <MyTask key={task.id} task={task} />)
          )}

          {(queue.data?.tasks.length ?? 0) > 0 ? (
            <>
              <h2 className="mt-4 text-lg font-bold text-ink">To review</h2>
              {queue.data?.tasks.map((task) => <ReviewTask key={task.id} task={task} />)}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function AddTask({ date }: { date: string }) {
  const groups = useGroups();
  const createTask = useCreateTask();

  const [title, setTitle] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);

  const available = groups.data?.groups ?? [];
  const target = groupId ?? available[0]?.id ?? null;
  const canAdd = title.trim().length > 0 && target !== null && !createTask.isPending;

  const submit = () => {
    if (!canAdd || !target) return;
    createTask.mutate(
      { groupId: target, title: title.trim(), dueDate: date },
      { onSuccess: () => setTitle('') },
    );
  };

  return (
    <Card>
      <Field
        label="Add a task for today"
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TASK_TITLE}
        placeholder="Read 20 pages of the textbook"
        onSubmit={submit}
      />

      {available.length > 1 ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-ink-muted">Group</p>
          <div className="flex flex-row flex-wrap gap-2">
            {available.map((group) => (
              <Button
                key={group.id}
                label={group.name}
                variant={group.id === target ? 'primary' : 'ghost'}
                onClick={() => setGroupId(group.id)}
                className="w-auto"
              />
            ))}
          </div>
        </div>
      ) : null}

      <ErrorText message={createTask.error?.message} />

      <div className="mt-3">
        <Button
          label="Add task"
          disabled={!canAdd}
          loading={createTask.isPending}
          onClick={submit}
        />
      </div>
    </Card>
  );
}

/** One of the user's own tasks, with the actions available in its current state. */
function MyTask({ task }: { task: Task }) {
  const markDone = useMarkDone();
  const submitProof = useSubmitProof();
  const deleteTask = useDeleteTask();

  const [proof, setProof] = useState('');
  const [expanded, setExpanded] = useState(false);

  return (
    <TaskRow task={task}>
      {task.status === 'planned' || task.status === 'missed' ? (
        <div className="flex flex-col gap-2">
          {expanded ? (
            <Field
              label="What did you do? (optional)"
              value={proof}
              onChangeText={setProof}
              maxLength={MAX_PROOF_TEXT}
              multiline
              rows={3}
              placeholder="Chapters 1-2, notes written up"
            />
          ) : null}
          <ErrorText message={markDone.error?.message} />
          <div className="flex flex-row gap-2">
            <Button
              className="flex-1"
              label={expanded ? 'Submit as done' : 'Mark done'}
              loading={markDone.isPending}
              onClick={() => {
                if (!expanded) {
                  setExpanded(true);
                  return;
                }
                markDone.mutate({
                  id: task.id,
                  ...(proof.trim() ? { proofText: proof.trim() } : {}),
                });
              }}
            />
            {task.status === 'planned' ? (
              <Button
                label="Delete"
                variant="ghost"
                className="w-auto"
                disabled={deleteTask.isPending}
                onClick={() => deleteTask.mutate(task.id)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {task.status === 'proof_requested' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-warning">
            Your buddy asked for a bit more detail before approving.
          </p>
          <Field
            label="Proof"
            value={proof}
            onChangeText={setProof}
            maxLength={MAX_PROOF_TEXT}
            multiline
            rows={3}
            placeholder="What exactly did you finish?"
          />
          <ErrorText message={submitProof.error?.message} />
          <Button
            label="Send proof"
            disabled={proof.trim().length === 0 || submitProof.isPending}
            loading={submitProof.isPending}
            onClick={() => submitProof.mutate({ id: task.id, proofText: proof.trim() })}
          />
        </div>
      ) : null}

      {task.status === 'done' ? (
        <p className="text-sm text-ink-muted">
          Waiting for a buddy in {task.groupName} to review it.
        </p>
      ) : null}
    </TaskRow>
  );
}

/** A buddy's task, with the approve / request-proof actions (§2.4). */
function ReviewTask({ task }: { task: Task }) {
  const review = useReviewTask();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'idle' | 'approving'>('idle');
  const [reporting, setReporting] = useState(false);

  const award = review.data?.award;

  if (review.isSuccess && award) {
    return (
      <Card className="border-success">
        <p className="text-base font-semibold text-ink">Reviewed · {task.title}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {task.ownerDisplayName} earned {award.credits + award.dailyBonus} credits
          {award.dailyBonus > 0 ? ' (day complete)' : ''} · {award.streak} day streak
        </p>
      </Card>
    );
  }

  return (
    <TaskRow task={task} showOwner>
      {mode === 'idle' ? (
        <div className="flex flex-col gap-2">
          <ErrorText message={review.error?.message} />
          <div className="flex flex-row gap-2">
            <Button label="Approve" className="flex-1" onClick={() => setMode('approving')} />
            <Button
              label="Ask for proof"
              variant="ghost"
              className="flex-1"
              loading={review.isPending}
              onClick={() =>
                review.mutate({
                  id: task.id,
                  action: 'request_proof',
                  ...(comment.trim() ? { comment: comment.trim() } : {}),
                })
              }
            />
          </div>
          {/* Reporting sits behind the review actions: it is the escalation for
              a task that is not merely unproven but dishonest (§2.6). */}
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="cursor-pointer text-center text-xs text-ink-subtle hover:text-ink-muted"
          >
            Report this task
          </button>
          <ReportSheet
            visible={reporting}
            onClose={() => setReporting(false)}
            targetType="task"
            targetId={task.id}
            targetLabel="this task"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-ink-muted">How well was it done?</p>
          <RatingPicker value={rating} onChange={setRating} />
          <Field
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            maxLength={MAX_REVIEW_COMMENT}
            placeholder="Solid work"
          />
          <ErrorText message={review.error?.message} />
          <div className="flex flex-row gap-2">
            <Button
              label="Confirm"
              className="flex-1"
              disabled={rating === null || review.isPending}
              loading={review.isPending}
              onClick={() => {
                if (rating === null) return;
                review.mutate({
                  id: task.id,
                  action: 'approve',
                  rating,
                  ...(comment.trim() ? { comment: comment.trim() } : {}),
                });
              }}
            />
            <Button label="Back" variant="ghost" className="flex-1" onClick={() => setMode('idle')} />
          </div>
        </div>
      )}
    </TaskRow>
  );
}
