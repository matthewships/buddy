'use client';

import { useState, type ReactNode } from 'react';

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
import { formatEstimate } from './TaskClock';
import { TaskRing } from './TaskRing';
import { StatusPill } from './TaskRow';

/**
 * The group's tasks, one member at a time (§2.4).
 *
 * This is where the daily loop lives now. It used to be a separate Today tab
 * that aggregated across every group, which put the work one level away from the
 * group it was already stored against — and made "whose tasks am I looking at?"
 * a question the screen could not answer. Here the member strip *is* the answer.
 *
 * The strip is also the group's member list. There was a second card below the
 * tasks that listed the same people again, in a screen already made of stacked
 * boxes; the avatars were always the better list, because they are the control
 * as well as the roster. Inviting hangs off the end of it for the same reason —
 * "add a person" belongs among the people.
 */
export function GroupTasks({
  group,
  members,
  viewerId,
  onInvite,
}: {
  group: GroupDetail;
  members: GroupMember[];
  viewerId: string;
  /** Opens the invite sheet. The strip's last chip is the way in. */
  onInvite: () => void;
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
    <div className="flex flex-col gap-4">
      {/*
        The member strip. A row of avatars rather than a dropdown: in a group of
        three or four, seeing everyone at once is the point — you are choosing a
        person, not filtering a list. Each carries how much that person still
        has open today, so the strip answers "how is everyone doing?" before
        anything is tapped.
      */}
      <div
        role="tablist"
        aria-label="Whose tasks to show"
        className="-mx-5 flex flex-row gap-2 overflow-x-auto px-5 pb-1"
      >
        {members.map((member) => {
          const active = member.id === selected?.id;
          const open = all.filter(
            (task) =>
              task.userId === member.id &&
              task.dueDate === today &&
              task.status !== 'approved',
          ).length;
          const busy = all.some((task) => task.userId === member.id && isRunning(task));

          return (
            <button
              key={member.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedId(member.id)}
              className={`flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 py-2 transition-colors ${
                active
                  ? 'border-brand bg-brand-muted'
                  : 'border-transparent hover:border-surface-border'
              }`}
            >
              <span className="relative">
                <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={44} />
                {/* A running clock is the one thing worth seeing from here. */}
                {busy ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-surface bg-brand"
                  />
                ) : null}
              </span>
              <span
                className={`max-w-16 truncate text-xs ${active ? 'font-semibold text-ink' : 'text-ink-muted'}`}
              >
                {member.id === viewerId ? 'You' : member.displayName.split(' ')[0]}
              </span>
              <span className="text-[10px] text-ink-subtle">{open ? `${open} open` : 'clear'}</span>
            </button>
          );
        })}

        {/* Inviting is part of the roster, not a section of its own. */}
        <button
          type="button"
          onClick={onInvite}
          className="flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl border border-transparent px-2 py-2 transition-colors hover:border-surface-border"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-surface-border text-xl leading-none text-ink-subtle">
            +
          </span>
          <span className="text-xs text-ink-muted">Invite</span>
        </button>
      </div>

      {waitingOnMe.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-warning">
            Waiting on you · {waitingOnMe.length}
          </h2>
          <div className="flex flex-col gap-2">
            {waitingOnMe.map((task) => (
              <ReviewTask key={task.id} task={task} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        {forSelected.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-subtle">
            {viewingSelf
              ? "Nothing planned yet. Write down what you'll finish today."
              : `${selected?.displayName ?? 'They'} hasn't planned anything yet.`}
          </p>
        ) : (
          forSelected.map((task) =>
            viewingSelf ? (
              <MyTask key={task.id} task={task} />
            ) : canReview(group, members, task, viewerId) && task.status === 'done' ? (
              <ReviewTask key={task.id} task={task} />
            ) : (
              <TheirTask key={task.id} task={task} />
            ),
          )
        )}

        {viewingSelf ? <AddTask groupId={group.id} /> : null}
      </section>
    </div>
  );
}

/**
 * The shell every task is drawn in: something on the left that says what state
 * it is in, the title, and whatever the viewer can do about it underneath.
 *
 * One shell for all three cases — mine, theirs, and mine-to-review — because
 * they are the same object seen from different sides, and a screen that draws
 * them three ways makes the reader work out that they are the same thing.
 */
function TaskShell({
  leading,
  title,
  meta,
  trailing,
  accent,
  children,
}: {
  leading: ReactNode;
  title: string;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** Border colour, for a task that wants the eye — running, or awaiting you. */
  accent?: 'brand' | 'warning' | null;
  children?: ReactNode;
}) {
  const border =
    accent === 'brand'
      ? 'border-brand'
      : accent === 'warning'
        ? 'border-warning'
        : 'border-surface-border';

  return (
    <div className={`flex flex-col rounded-2xl border bg-surface p-3 ${border}`}>
      <div className="flex flex-row items-center gap-3">
        {leading}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-base font-medium text-ink">{title}</p>
          {meta ? <div className="flex flex-row items-center gap-2 text-xs">{meta}</div> : null}
        </div>
        {trailing}
      </div>
      {children ? <div className="mt-3 flex flex-col gap-2">{children}</div> : null}
    </div>
  );
}

/**
 * The dot that stands in for the ring on a task that is not running. Same
 * footprint as the ring, so a list does not reflow when a clock starts.
 */
function StatusDot({ task }: { task: Task }) {
  const tone =
    task.status === 'approved'
      ? 'border-success text-success'
      : task.status === 'done'
        ? 'border-brand text-brand'
        : task.status === 'missed'
          ? 'border-danger text-danger'
          : task.status === 'proof_requested'
            ? 'border-warning text-warning'
            : 'border-surface-border text-ink-subtle';

  return (
    <span
      aria-hidden="true"
      className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ${tone}`}
    >
      {task.estimatedMinutes !== null ? (
        <span className="text-xs font-semibold">{formatEstimate(task.estimatedMinutes)}</span>
      ) : (
        <span className="text-lg leading-none">·</span>
      )}
    </span>
  );
}

/** Adding a task: a row shaped like a task, which opens into the form. */
function AddTask({ groupId }: { groupId: string }) {
  const createTask = useCreateTask();
  const [open, setOpen] = useState(false);
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
      {
        onSuccess: () => {
          setTitle('');
          // Left open: planning a day is usually more than one task, and
          // reopening the form for each is a tap that buys nothing.
        },
      },
    );
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex cursor-pointer flex-row items-center gap-3 rounded-2xl border border-dashed border-surface-border bg-surface/50 p-3 text-left transition-colors hover:border-brand hover:bg-surface"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-surface-border text-2xl leading-none text-ink-subtle">
          +
        </span>
        <span className="flex flex-col">
          <span className="text-base font-medium text-ink">Add a task</span>
          <span className="text-xs text-ink-subtle">Something you&rsquo;ll finish today</span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand bg-surface p-3">
      <Field
        label="What will you finish today?"
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TASK_TITLE}
        placeholder="Read 20 pages of the textbook"
        onSubmit={submit}
        autoFocus
      />

      <DurationInput minutes={minutes} onChange={setMinutes} error={timeError} />

      <ErrorText message={createTask.error?.message} />
      <div className="flex flex-row gap-2">
        <Button
          className="flex-1"
          label="Add task"
          disabled={!canAdd}
          loading={createTask.isPending}
          onClick={submit}
        />
        <Button
          label="Done adding"
          variant="ghost"
          className="w-auto"
          onClick={() => {
            setOpen(false);
            setTitle('');
          }}
        />
      </div>
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
  /**
   * Starting needs an estimate — there is nothing to count down without one —
   * so a task the mobile app created cannot offer it. Finishing is always on
   * offer: a task done away from the app, or one the rollover already marked
   * missed, still has to be closable without starting a clock first.
   */
  const canStart = !running && task.estimatedMinutes !== null;
  const open = task.status === 'planned' || task.status === 'missed';

  return (
    <TaskShell
      accent={running ? 'brand' : null}
      leading={
        running && task.startedAt && task.estimatedMinutes !== null ? (
          <TaskRing startedAt={task.startedAt} estimatedMinutes={task.estimatedMinutes} />
        ) : (
          <StatusDot task={task} />
        )
      }
      title={task.title}
      meta={
        running ? (
          <span className="font-semibold text-brand">In progress</span>
        ) : (
          <StatusPill status={task.status} />
        )
      }
      trailing={
        task.status === 'planned' && !running ? (
          <button
            type="button"
            aria-label={`Delete ${task.title}`}
            disabled={deleteTask.isPending}
            onClick={() => deleteTask.mutate(task.id)}
            className="cursor-pointer rounded-full px-2 py-1 text-lg leading-none text-ink-subtle transition-colors hover:text-danger disabled:cursor-not-allowed"
          >
            ×
          </button>
        ) : null
      }
    >
      {running ? (
        <>
          <p className="text-xs text-ink-muted">
            Group chat is closed to you until this task ends. Finishing costs nothing; dropping it
            costs 10 points.
          </p>
          <div className="flex flex-row gap-2">
            <Button
              className="flex-1"
              label={expanded ? 'Submit as done' : 'Done'}
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
            {confirmingAbandon ? (
              <Button
                label="Yes, drop it (−10)"
                variant="danger"
                className="w-auto"
                loading={abandon.isPending}
                onClick={() =>
                  abandon.mutate(task.id, { onSuccess: () => setConfirmingAbandon(false) })
                }
              />
            ) : (
              <Button
                label="Drop"
                variant="ghost"
                className="w-auto"
                onClick={() => setConfirmingAbandon(true)}
              />
            )}
          </div>
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
          <ErrorText message={abandon.error?.message ?? markDone.error?.message} />
        </>
      ) : null}

      {open && !running ? (
        <>
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
            {canStart ? (
              <Button
                className="flex-1"
                label="Start"
                loading={start.isPending}
                onClick={() => start.mutate(task.id)}
              />
            ) : null}
            <Button
              className="flex-1"
              // Start leads while the task has not begun, so Done steps back to
              // the quieter variant rather than competing with it.
              variant={canStart ? 'secondary' : 'primary'}
              label={expanded ? 'Submit as done' : 'Done'}
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
          </div>
        </>
      ) : null}

      {task.status === 'proof_requested' ? (
        <>
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
        </>
      ) : null}

      {task.status === 'done' ? (
        <p className="text-sm text-ink-muted">Waiting for a review.</p>
      ) : null}
    </TaskShell>
  );
}

/** Someone else's task, when the viewer is not the one who reviews it. */
function TheirTask({ task }: { task: Task }) {
  const running = isRunning(task);

  return (
    <TaskShell
      accent={running ? 'brand' : null}
      leading={
        running && task.startedAt && task.estimatedMinutes !== null ? (
          <TaskRing startedAt={task.startedAt} estimatedMinutes={task.estimatedMinutes} />
        ) : (
          <StatusDot task={task} />
        )
      }
      title={task.title}
      meta={
        running ? (
          <span className="font-semibold text-brand">In progress</span>
        ) : (
          <StatusPill status={task.status} />
        )
      }
    />
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
      <div className="flex flex-col rounded-2xl border border-success bg-surface p-3">
        <p className="text-base font-semibold text-ink">Reviewed · {task.title}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {task.ownerDisplayName} earned {award.credits + award.dailyBonus} points
          {award.dailyBonus > 0 ? ' (day complete)' : ''} · {award.streak} day streak
        </p>
      </div>
    );
  }

  return (
    <TaskShell
      accent="warning"
      leading={<StatusDot task={task} />}
      title={task.title}
      meta={<span className="text-ink-muted">{task.ownerDisplayName}</span>}
    >
      {task.proofText ? (
        <div className="flex flex-col rounded-xl bg-surface-muted p-3">
          <p className="text-xs font-semibold text-ink-muted">Proof</p>
          <p className="text-sm text-ink">{task.proofText}</p>
        </div>
      ) : null}

      {mode === 'idle' ? (
        <>
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
        </>
      ) : (
        <>
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
        </>
      )}
    </TaskShell>
  );
}
