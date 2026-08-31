'use client';

import { useState } from 'react';

import { MAX_PROOF_TEXT, MAX_TASK_TITLE } from '@buddy/shared';

import type { GroupDetail, GroupMember } from '@/api/groups';
import {
  isRunning,
  localToday,
  useAbandonTask,
  useCreateTask,
  useDeleteTask,
  useGroupTasks,
  useMarkDone,
  useReviewTask,
  useStartTask,
  useSubmitProof,
  type Task,
} from '@/api/tasks';
import { canReview } from '@/lib/review-rights';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { DurationInput, durationError } from './DurationInput';
import { ErrorText } from './ErrorText';
import { Field } from './Field';
import { RatingPicker } from './RatingPicker';
import { ReportSheet } from './ReportSheet';
import { Spinner } from './Spinner';
import { TaskClock, formatEstimate } from './TaskClock';
import { StatusPill, TaskRow } from './TaskRow';

/**
 * The group's tasks, one member at a time (§2.4).
 *
 * This is where the daily loop lives now. It used to be a separate Today tab
 * that aggregated across every group, which put the work one level away from the
 * group it was already stored against — and made "whose tasks am I looking at?"
 * a question the screen could not answer. Here the member strip *is* the answer.
 *
 * The section at the top is what Today's cross-group review queue became. It is
 * per-group now because the reviewer is, too: with a Buddy named, the person who
 * reviews is a property of the group rather than whoever arrives first.
 */
export function GroupTasks({
  group,
  members,
  viewerId,
}: {
  group: GroupDetail;
  members: GroupMember[];
  viewerId: string;
}) {
  const tasks = useGroupTasks(group.id);
  const [selectedId, setSelectedId] = useState(viewerId);

  if (tasks.isPending) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  const all = tasks.data?.tasks ?? [];
  const today = localToday();
  const selected = members.find((m) => m.id === selectedId) ?? members.find((m) => m.id === viewerId);
  const viewingSelf = selected?.id === viewerId;

  const forSelected = all.filter((task) => task.userId === selected?.id);
  const waitingOnMe = all.filter(
    (task) => task.status === 'done' && canReview(group, members, task, viewerId),
  );

  return (
    <>
      {waitingOnMe.length > 0 ? (
        <Card className="border-warning">
          <p className="mb-2 text-sm font-semibold text-ink-muted">
            Waiting on you · {waitingOnMe.length}
          </p>
          <div className="flex flex-col gap-3">
            {waitingOnMe.map((task) => (
              <ReviewTask key={task.id} task={task} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <p className="mb-3 text-sm font-semibold text-ink-muted">Tasks</p>

        {/*
          The member toggle. A row of avatars rather than a dropdown: in a group
          of three or four, seeing everyone at once is the point — you are
          choosing a person, not filtering a list.
        */}
        <div
          role="tablist"
          aria-label="Whose tasks to show"
          className="mb-4 flex flex-row gap-2 overflow-x-auto pb-1"
        >
          {members.map((member) => {
            const active = member.id === selected?.id;
            const pending = all.filter(
              (task) => task.userId === member.id && task.dueDate === today,
            ).length;
            return (
              <button
                key={member.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedId(member.id)}
                className={`flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl border px-3 py-2 transition-colors ${
                  active
                    ? 'border-brand bg-surface-muted'
                    : 'border-transparent hover:border-surface-border'
                }`}
              >
                <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={40} />
                <span
                  className={`max-w-16 truncate text-xs ${active ? 'font-semibold text-ink' : 'text-ink-muted'}`}
                >
                  {member.id === viewerId ? 'You' : member.displayName.split(' ')[0]}
                </span>
                <span className="text-[10px] text-ink-subtle">{pending} today</span>
              </button>
            );
          })}
        </div>

        {viewingSelf ? <AddTask groupId={group.id} /> : null}

        {forSelected.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            {viewingSelf
              ? "Nothing planned yet. Write down what you'll finish today."
              : `${selected?.displayName ?? 'They'} hasn't planned anything yet.`}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {forSelected.map((task) =>
              viewingSelf ? (
                <MyTask key={task.id} task={task} />
              ) : canReview(group, members, task, viewerId) && task.status === 'done' ? (
                <ReviewTask key={task.id} task={task} />
              ) : (
                <TheirTask key={task.id} task={task} />
              ),
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function AddTask({ groupId }: { groupId: string }) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number>(30);

  const timeError = durationError(minutes);
  const canAdd = title.trim().length > 0 && timeError === null && !createTask.isPending;

  const submit = () => {
    if (!canAdd) return;
    createTask.mutate(
      {
        groupId,
        title: title.trim(),
        dueDate: localToday(),
        estimatedMinutes: minutes,
      },
      { onSuccess: () => setTitle('') },
    );
  };

  return (
    <div className="mb-2 flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface-muted p-3">
      <Field
        label="Add a task for today"
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TASK_TITLE}
        placeholder="Read 20 pages of the textbook"
        onSubmit={submit}
      />

      <DurationInput minutes={minutes} onChange={setMinutes} error={timeError} />

      <ErrorText message={createTask.error?.message} />
      <Button label="Add task" disabled={!canAdd} loading={createTask.isPending} onClick={submit} />
    </div>
  );
}

/** One of the viewer's own tasks, with the actions its state allows. */
function MyTask({ task }: { task: Task }) {
  const markDone = useMarkDone();
  const submitProof = useSubmitProof();
  const deleteTask = useDeleteTask();
  const start = useStartTask();
  const abandon = useAbandonTask();

  const [proof, setProof] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);

  const running = isRunning(task);

  return (
    <TaskRow task={task}>
      {task.estimatedMinutes !== null && !running ? (
        <p className="text-xs text-ink-subtle">Planned for {formatEstimate(task.estimatedMinutes)}</p>
      ) : null}

      {running && task.startedAt && task.estimatedMinutes !== null ? (
        <div className="flex flex-col gap-2 rounded-xl border border-brand bg-surface-muted p-3">
          <div className="flex flex-row items-center justify-between">
            <span className="text-sm font-semibold text-ink">In progress</span>
            <TaskClock startedAt={task.startedAt} estimatedMinutes={task.estimatedMinutes} />
          </div>
          <p className="text-xs text-ink-muted">
            Group chat is closed to you until this task ends. Finishing costs nothing; dropping it
            costs 10 points.
          </p>
          {confirmingAbandon ? (
            <div className="flex flex-row gap-2">
              <Button
                label="Yes, drop it (−10)"
                variant="danger"
                loading={abandon.isPending}
                onClick={() =>
                  abandon.mutate(task.id, { onSuccess: () => setConfirmingAbandon(false) })
                }
              />
              <Button
                label="Keep going"
                variant="ghost"
                onClick={() => setConfirmingAbandon(false)}
              />
            </div>
          ) : (
            <Button label="Drop this task" variant="ghost" onClick={() => setConfirmingAbandon(true)} />
          )}
          <ErrorText message={abandon.error?.message} />
        </div>
      ) : null}

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
          <ErrorText message={markDone.error?.message ?? start.error?.message} />
          <div className="flex flex-row gap-2">
            {!running && task.estimatedMinutes !== null ? (
              <Button
                className="flex-1"
                label="Start"
                loading={start.isPending}
                onClick={() => start.mutate(task.id)}
              />
            ) : null}
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
            {task.status === 'planned' && !running ? (
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
        <p className="text-sm text-ink-muted">Waiting for a review.</p>
      ) : null}
    </TaskRow>
  );
}

/** Someone else's task, when the viewer is not the one who reviews it. */
function TheirTask({ task }: { task: Task }) {
  const running = isRunning(task);
  return (
    <div className="flex flex-row items-start gap-2 rounded-2xl border border-surface-border bg-surface p-3">
      <div className="flex flex-1 flex-col gap-1">
        <p
          className={`text-base ${task.status === 'approved' ? 'text-ink-muted line-through' : 'text-ink'}`}
        >
          {task.title}
        </p>
        {running && task.startedAt && task.estimatedMinutes !== null ? (
          <div className="flex flex-row items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden="true" />
            <TaskClock startedAt={task.startedAt} estimatedMinutes={task.estimatedMinutes} />
          </div>
        ) : task.estimatedMinutes !== null ? (
          <p className="text-xs text-ink-subtle">{formatEstimate(task.estimatedMinutes)}</p>
        ) : null}
      </div>
      <StatusPill status={task.status} />
    </div>
  );
}

/** A task the viewer is the one to review (§2.4). */
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
          {task.ownerDisplayName} earned {award.credits + award.dailyBonus} points
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
            targetType="task"
            targetId={task.id}
            targetLabel={task.title}
            onClose={() => setReporting(false)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <RatingPicker value={rating} onChange={setRating} />
          <Field
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            maxLength={200}
            placeholder="Nice work"
          />
          <ErrorText message={review.error?.message} />
          <div className="flex flex-row gap-2">
            <Button
              className="flex-1"
              label="Approve"
              disabled={rating === null || review.isPending}
              loading={review.isPending}
              onClick={() =>
                review.mutate({
                  id: task.id,
                  action: 'approve',
                  rating: rating ?? 0,
                  ...(comment.trim() ? { comment: comment.trim() } : {}),
                })
              }
            />
            <Button label="Back" variant="ghost" className="w-auto" onClick={() => setMode('idle')} />
          </div>
        </div>
      )}
    </TaskRow>
  );
}
