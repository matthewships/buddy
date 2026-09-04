'use client';

import { type ReactNode, useEffect, useId, useState } from 'react';

import {
  MAX_PROOF_TEXT,
  MAX_TASK_MINUTES,
  MAX_TASK_TITLE,
  STATUSES,
  status as statusFor,
} from '@buddy/shared';

import { useSetStatus } from '@/api/auth';
import type { GroupDetail, GroupMember } from '@/api/groups';
import {
  isRunning,
  localToday,
  localTomorrow,
  useAbandonTask,
  useCreateTask,
  useDeleteTask,
  useGroupTasks,
  useMarkDone,
  useReviewTask,
  useStartTask,
  useSubmitProof,
  useUpdateTask,
  type Task,
  useProofImage,
} from '@/api/tasks';
import { useProofImageUpload } from '@/api/avatar';
import { serverNow } from '@/hooks/useCountdown';
import { canReview } from '@/lib/review-rights';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { DurationInput, durationError } from './DurationInput';
import { ErrorText } from './ErrorText';
import { Field } from './Field';
import { RatingPicker } from './RatingPicker';
import { ReportSheet } from './ReportSheet';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';
import { formatEstimate } from './TaskClock';
import { SessionPanel } from './SessionPanel';
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
  const [pickingStatus, setPickingStatus] = useState(false);
  const viewingSelf = selected?.id === viewerId;

  const forSelected = all.filter((task) => task.userId === selected?.id);

  /**
   * The selected member's tasks, bucketed by due date. The API already orders
   * newest day first, so insertion order into the Map is the order to render.
   */
  const days = [...forSelected.reduce((acc, task) => {
    const list = acc.get(task.dueDate) ?? [];
    list.push(task);
    acc.set(task.dueDate, list);
    return acc;
  }, new Map<string, Task[]>())];
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
          const isBuddy = member.id === group.buddyUserId;

          return (
            <button
              key={member.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedId(member.id)}
              className={`flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors ${
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
                {/*
                  Who checks the work, marked on the person rather than
                  explained in a sentence underneath. The group screen already
                  said it in prose — "checked by Ana" — which is the kind of
                  line you read once and never again, and it left the roster
                  itself showing four identical faces. Bottom-left, clear of the
                  running-clock dot, which is the one thing allowed to sit at
                  the top.
                */}
                {isBuddy ? (
                  <span
                    title="Checks the group's tasks"
                    className="absolute -bottom-0.5 -left-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-brand text-brand-fg"
                  >
                    <span className="sr-only">Buddy — checks the group&rsquo;s tasks</span>
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={4}>
                      <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : null}
                {/*
                  Today's status, on the face rather than in a list somewhere
                  else. Bottom-right, so it never collides with the Buddy mark
                  or the running clock. It is one glyph because the strip has
                  room for one glyph — the words are on the row underneath.
                */}
                {statusFor(member.statusKey ?? '') ? (
                  <span
                    title={statusFor(member.statusKey ?? '')!.label}
                    className="absolute -bottom-0.5 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface bg-surface text-[10px] leading-none"
                  >
                    <span className="sr-only">{statusFor(member.statusKey ?? '')!.label}</span>
                    <span aria-hidden="true">{statusFor(member.statusKey ?? '')!.emoji}</span>
                  </span>
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
          className="flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-surface-border"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-surface-border text-xl leading-none text-ink-subtle">
            +
          </span>
          <span className="text-xs text-ink-muted">Invite</span>
        </button>
      </div>

      {selected ? (
        <TodayStatus
          member={selected}
          isViewer={selected.id === viewerId}
          onChange={() => setPickingStatus(true)}
        />
      ) : null}

      <StatusPicker
        open={pickingStatus}
        onClose={() => setPickingStatus(false)}
        current={members.find((m) => m.id === viewerId)?.statusKey ?? null}
      />

      {/* The room's shared clock (PRODUCT.md §3.1), above the work it is for. */}
      <SessionPanel groupId={group.id} viewerId={viewerId} memberCount={members.length} />

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
        {/*
          Above the list, not below it. This is a log that only grows: every task
          the person has ever had here, newest day first. Putting the one control
          that adds to it at the bottom meant scrolling past every past day to
          reach it, and the scroll got longer the more the app was used — the
          people with the most to plan had the furthest to go.
        */}
        {viewingSelf ? <AddTask groupId={group.id} /> : null}

        {forSelected.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-subtle">
            {viewingSelf
              ? "Nothing planned yet. Write down what you'll finish today."
              : `${selected?.displayName ?? 'They'} hasn't planned anything yet.`}
          </p>
        ) : (
          /*
            Grouped by the day the work was for. The list is every task this
            person has ever had here, newest day first, and undivided it read as
            one long undated pile in which today — the only day anyone can still
            act on — looked exactly like a fortnight ago.
          */
          days.map(([day, dayTasks]) => (
            <div key={day} className="flex flex-col gap-2">
              <h3 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {dayLabel(day, today)}
              </h3>
              {dayTasks.map((task) =>
                viewingSelf ? (
                  <MyTask key={task.id} task={task} />
                ) : canReview(group, members, task, viewerId) && task.status === 'done' ? (
                  <ReviewTask key={task.id} task={task} />
                ) : (
                  <TheirTask key={task.id} task={task} />
                ),
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * "Today", "Yesterday", or a written date — the words people actually use for
 * the two days that matter, and something unambiguous for the rest.
 */
/**
 * The selected person's status, in words (§2.6).
 *
 * Two different jobs behind one row. On yourself it is the control — a status
 * nobody can set is decoration, and this is the screen it is about, so it is
 * set from here rather than from a settings page nobody visits daily. On
 * somebody else it carries the line the status *invites*, which is the whole
 * point of the feature: "Stuck" on its own is a mood, and "Ask what it is stuck
 * on" is a thing to do.
 *
 * Nothing renders for another member who has set nothing. An empty prompt to
 * message someone about nothing is worse than a quiet screen.
 */
function TodayStatus({
  member,
  isViewer,
  onChange,
}: {
  member: GroupMember;
  isViewer: boolean;
  onChange: () => void;
}) {
  const current = statusFor(member.statusKey ?? '');

  if (!isViewer) {
    if (!current) return null;
    return (
      <div className="flex flex-row items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2.5">
        <span aria-hidden="true" className="text-lg">
          {current.emoji}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-ink">
            {member.displayName.split(' ')[0]} · {current.label}
          </span>
          <span className="text-xs text-ink-muted">{current.invites}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onChange}
      className="flex cursor-pointer flex-row items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2.5 text-left transition-colors hover:border-brand"
    >
      <span aria-hidden="true" className="text-lg">
        {current?.emoji ?? '💬'}
      </span>
      <span className="flex-1 text-sm text-ink">
        {current ? (
          <>
            Today you&rsquo;re <span className="font-semibold">{current.label.toLowerCase()}</span>
          </>
        ) : (
          'Tell the group how today is going'
        )}
      </span>
      <span className="text-sm font-semibold text-brand">{current ? 'Change' : 'Set'}</span>
    </button>
  );
}

/**
 * The picker. Bottom placement, because it belongs to the row that opened it
 * rather than to the app — the same rule the invite and proof sheets follow.
 *
 * Clearing is offered as plainly as setting. A status that can only be replaced
 * and never removed forces a person who simply does not want to say anything
 * today to keep saying yesterday's thing until midnight.
 */
function StatusPicker({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
}) {
  const setStatus = useSetStatus();

  const choose = (key: string | null) => {
    setStatus.mutate(key, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onClose={onClose} title="How is today going?">
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-bold text-ink">How is today going?</h2>
        <Button label="Close" variant="ghost" className="w-auto" onClick={onClose} />
      </div>
      <p className="-mt-1 text-sm text-ink-muted">
        Your group sees this until midnight. It is how they know whether to leave you alone or say
        something.
      </p>

      <ul className="flex flex-col divide-y divide-surface-border">
        {STATUSES.map((option) => (
          <li key={option.key}>
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => choose(option.key)}
              className={`flex w-full cursor-pointer flex-row items-center gap-3 py-3 text-left disabled:opacity-60 ${
                option.key === current ? 'font-semibold' : ''
              }`}
            >
              <span aria-hidden="true" className="text-xl">
                {option.emoji}
              </span>
              <span className="flex-1 text-base text-ink">{option.label}</span>
              {option.key === current ? (
                <span className="text-sm font-semibold text-brand">Current</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <ErrorText message={setStatus.error?.message} />

      {current ? (
        <Button
          label="Clear it"
          variant="ghost"
          disabled={setStatus.isPending}
          onClick={() => choose(null)}
        />
      ) : null}
    </Sheet>
  );
}

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';

  const asDate = new Date(`${day}T00:00:00`);
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  if (asDate.getTime() === yesterday.getTime()) return 'Yesterday';

  const future = day > today;
  const formatted = asDate.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  // A task planned ahead reads as a promise, not as history.
  return future ? `Coming up · ${formatted}` : formatted;
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
    <div className={`flex flex-col rounded-lg border bg-surface p-3 ${border}`}>
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
        className="flex cursor-pointer flex-row items-center gap-3 rounded-lg border border-dashed border-surface-border bg-surface/50 p-3 text-left transition-colors hover:border-brand hover:bg-surface"
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
    <div className="flex flex-col gap-3 rounded-lg border border-brand bg-surface p-3">
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
/**
 * Whether a running task has passed its estimate, ticking so the moment it does
 * is visible without a refresh.
 *
 * Its own interval rather than a value lifted out of `TaskRing`: the ring is a
 * presentational component with a clock inside it, and threading state upward
 * from it would make every row re-render every second to answer a question that
 * changes once. This stops ticking the moment it has its answer, and there is at
 * most one running task per person by rule.
 */
function useOverrun(task: Task): boolean {
  const target =
    task.startedAt && task.estimatedMinutes !== null
      ? Date.parse(task.startedAt) + task.estimatedMinutes * 60_000
      : null;

  const [over, setOver] = useState(() => (target === null ? false : serverNow() >= target));

  useEffect(() => {
    if (target === null) {
      setOver(false);
      return;
    }
    if (serverNow() >= target) {
      setOver(true);
      return;
    }
    setOver(false);
    const timer = setInterval(() => {
      if (serverNow() >= target) setOver(true);
    }, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return over;
}

/** How much a "give it more time" button adds, in minutes. */
const TIME_BUMPS = [10, 30] as const;

/**
 * One of the viewer's own tasks.
 *
 * The actions are a function of the state, and there are five states worth
 * distinguishing. The two the app used to handle badly are the interesting
 * ones:
 *
 * **Overrun** — the clock has passed the estimate and the task is still open.
 * Nothing happens to it, which is right, but the only offers were Done and
 * Drop(−10), so someone who simply needed another twenty minutes had to either
 * lie or pay. Now the estimate can be extended in place, which is the honest
 * answer to "this is taking longer than I thought".
 *
 * **Missed** — the day ended. The state is not a verdict and is not terminal,
 * so this reads as an invitation rather than a scolding: the button says "You
 * can do this", and taking it revives the task onto today. Giving it more time
 * first and shelving it until tomorrow are both a tap away, because the reason
 * a task got missed is usually one of those two.
 */
function MyTask({ task }: { task: Task }) {
  const markDone = useMarkDone();
  const submitProof = useSubmitProof();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const start = useStartTask();
  const abandon = useAbandonTask();

  const [proof, setProof] = useState('');
  const [proofImageKey, setProofImageKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const running = isRunning(task);
  const overrun = useOverrun(running ? task : { ...task, startedAt: null });
  const missed = task.status === 'missed';
  const open = task.status === 'planned' || missed;

  /**
   * Starting needs an estimate — there is nothing to count down without one —
   * so a task the mobile app created cannot offer it. Finishing is always on
   * offer: a task done away from the app, or one the rollover already marked
   * missed, still has to be closable without starting a clock first.
   */
  const canStart = !running && task.estimatedMinutes !== null;
  const minutes = task.estimatedMinutes ?? 0;
  // The server caps the estimate, so a bump that would exceed it is not offered
  // rather than sent and rejected.
  const canAddTime = task.estimatedMinutes !== null && minutes < MAX_TASK_MINUTES;

  const addTime = (delta: number) =>
    updateTask.mutate({
      id: task.id,
      estimatedMinutes: Math.min(MAX_TASK_MINUTES, minutes + delta),
    });

  const finish = () => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    markDone.mutate({
      id: task.id,
      ...(proof.trim() ? { proofText: proof.trim() } : {}),
      ...(proofImageKey ? { proofImageKey } : {}),
    });
  };

  const proofField = expanded ? (
    <>
      <Field
        label="What did you do? (optional)"
        value={proof}
        onChangeText={setProof}
        maxLength={MAX_PROOF_TEXT}
        multiline
        rows={3}
        placeholder="Chapters 1-2, notes written up"
      />
      <ProofPhotoPicker imageKey={proofImageKey} onChange={setProofImageKey} />
    </>
  ) : null;

  return (
    <TaskShell
      accent={overrun ? 'warning' : running ? 'brand' : missed ? 'warning' : null}
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
          <span className={`font-semibold ${overrun ? 'text-warning' : 'text-brand'}`}>
            {overrun ? 'Running over' : 'In progress'}
          </span>
        ) : task.status === 'planned' ? (
          /*
            Nothing, when there is nothing to say. "Planned" on every row in a
            list of plans is a word that only makes the rows which are *not*
            planned harder to pick out, and the estimate is already in the
            circle to the left. What is worth saying is when there isn't one —
            because that is the task that cannot be started.
          */
          task.estimatedMinutes === null ? (
            <span className="text-ink-subtle">No time set</span>
          ) : null
        ) : (
          <StatusPill status={task.status} />
        )
      }
      trailing={
        // Not while it is running: "not today" and "delete" are both answers to
        // a task you have not committed to yet, and offering them mid-clock
        // would be a third way out of a run that is supposed to have two.
        open && !running ? (
          <button
            type="button"
            aria-label={`Options for ${task.title}`}
            onClick={() => setOptionsOpen(true)}
            className="cursor-pointer rounded-full px-2 py-1 text-lg leading-none text-ink-subtle transition-colors hover:text-ink"
          >
            ⋯
          </button>
        ) : null
      }
    >
      {running ? (
        <>
          <p className="text-xs text-ink-muted">
            {overrun
              ? 'Past your estimate — which happens. Finish it, or give yourself more time.'
              : 'Group chat is closed to you until this task ends. Finishing or dropping it opens the chat again, and the minutes you worked count either way.'}
          </p>

          {/* Surfaced inline only while overrunning: that is the minute someone
              needs it, and before then it is one more button to read past. */}
          {overrun && canAddTime ? (
            <div className="flex flex-row flex-wrap gap-2">
              {TIME_BUMPS.map((delta) => (
                <Button
                  key={delta}
                  label={`+${delta} min`}
                  variant="secondary"
                  className="w-auto"
                  disabled={updateTask.isPending}
                  onClick={() => addTime(delta)}
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-row gap-2">
            <Button
              className="flex-1"
              label={expanded ? 'Submit as done' : 'Done'}
              loading={markDone.isPending}
              onClick={finish}
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
          {proofField}
          <ErrorText
            message={
              abandon.error?.message ?? markDone.error?.message ?? updateTask.error?.message
            }
          />
        </>
      ) : null}

      {open && !running ? (
        <>
          {missed ? (
            <p className="text-sm text-ink-muted">
              This one got away. Pick it back up and it moves to today.
            </p>
          ) : null}
          {proofField}
          <ErrorText message={markDone.error?.message ?? start.error?.message} />
          <div className="flex flex-row gap-2">
            {canStart ? (
              <Button
                className="flex-1"
                // The missed state is not a scolding. Same action, different
                // thing to say about it.
                label={missed ? 'You can do this' : 'Start'}
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
              onClick={finish}
            />
          </div>
        </>
      ) : null}

      <TaskOptions
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        task={task}
        canAddTime={canAddTime}
        busy={updateTask.isPending || deleteTask.isPending}
        error={updateTask.error?.message ?? deleteTask.error?.message}
        onAddTime={addTime}
        onNotToday={() =>
          updateTask.mutate(
            { id: task.id, dueDate: localTomorrow() },
            { onSuccess: () => setOptionsOpen(false) },
          )
        }
        onDelete={() => deleteTask.mutate(task.id)}
      />

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
          <ProofPhotoPicker imageKey={proofImageKey} onChange={setProofImageKey} />
          <ErrorText message={submitProof.error?.message} />
          <Button
            label="Send proof"
            disabled={(proof.trim().length === 0 && !proofImageKey) || submitProof.isPending}
            loading={submitProof.isPending}
            onClick={() =>
              submitProof.mutate({
                id: task.id,
                proofText: proof.trim(),
                ...(proofImageKey ? { proofImageKey } : {}),
              })
            }
          />
        </>
      ) : null}

      {task.status === 'done' ? (
        <p className="text-sm text-ink-muted">Waiting for a review.</p>
      ) : null}
    </TaskShell>
  );
}

/**
 * The things you do to a task that are not "work on it now": give it more time,
 * shelve it until tomorrow, or admit it was never going to happen.
 *
 * In a sheet rather than on the row because they are all occasional, and a row
 * carrying six buttons makes the two that matter harder to find. "Not today"
 * moves the task to tomorrow rather than deleting it — the usual reason a task
 * goes unstarted is the day, not the task — and costs nothing, because no clock
 * was ever started and so no commitment was broken. That is the whole
 * difference between it and Drop.
 */
function TaskOptions({
  open,
  onClose,
  task,
  canAddTime,
  busy,
  error,
  onAddTime,
  onNotToday,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  task: Task;
  canAddTime: boolean;
  busy: boolean;
  error?: string;
  onAddTime: (delta: number) => void;
  onNotToday: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={task.title}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-ink">{task.title}</h2>
        {task.estimatedMinutes !== null ? (
          <p className="text-sm text-ink-muted">
            Planned for {formatEstimate(task.estimatedMinutes)}
          </p>
        ) : null}
      </div>

      {canAddTime ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Give it more time
          </p>
          <div className="flex flex-row gap-2">
            {TIME_BUMPS.map((delta) => (
              <Button
                key={delta}
                className="flex-1"
                label={`+${delta} min`}
                variant="secondary"
                disabled={busy}
                onClick={() => onAddTime(delta)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-surface-border pt-4">
        <Button
          label="Not today — move to tomorrow"
          variant="secondary"
          disabled={busy}
          onClick={onNotToday}
        />
        <p className="text-xs text-ink-subtle">
          It keeps its title and its time, and costs nothing — no clock was running.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-surface-border pt-4">
        {confirmingDelete ? (
          <div className="flex flex-row gap-2">
            <Button
              className="flex-1"
              label="Yes, delete it"
              variant="danger"
              disabled={busy}
              onClick={onDelete}
            />
            <Button
              className="flex-1"
              label="Keep it"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
            />
          </div>
        ) : (
          <Button
            label="Delete this task"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          />
        )}
      </div>

      <ErrorText message={error} />
    </Sheet>
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
        ) : task.status === 'planned' ? (
          task.estimatedMinutes === null ? (
            <span className="text-ink-subtle">No time set</span>
          ) : null
        ) : (
          <StatusPill status={task.status} />
        )
      }
    />
  );
}

/**
 * Attaching a photo to a proof (§2.4).
 *
 * The file is uploaded the moment it is chosen rather than held until the form
 * is submitted, so the task write carries only a key. That keeps "mark done"
 * one small JSON request instead of a multipart one, and means a slow upload
 * blocks the button rather than silently delaying the finish.
 *
 * The preview is an object URL over the local `File`, not a fetch of what was
 * just stored: the bytes are already here, and the stored copy is behind an
 * authenticated route the owner has no reason to hit.
 */
function ProofPhotoPicker({
  imageKey,
  onChange,
}: {
  imageKey: string | null;
  onChange: (key: string | null) => void;
}) {
  const upload = useProofImageUpload();
  const [preview, setPreview] = useState<string | null>(null);
  const inputId = useId();

  // The object URL is a resource with a lifetime; revoke the previous one
  // whenever it is replaced, and the last one when this unmounts.
  useEffect(() => () => setPreview((url) => (url && URL.revokeObjectURL(url), null)), []);

  const choose = (file: File | undefined) => {
    if (!file) return;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    upload.mutate(file, {
      onSuccess: ({ key }) => onChange(key),
      onError: () =>
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return null;
        }),
    });
  };

  const clear = () => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          // Clearing lets the same file be picked again after a removal.
          event.target.value = '';
        }}
      />

      {preview && imageKey ? (
        <div className="flex flex-row items-center gap-3 rounded-md border border-surface-border p-2">
          {/* An object URL cannot go through next/image, which needs a
              fetchable path — the same reason Avatar.tsx uses a plain tag. */}
          <img
            src={preview}
            alt="The photo you attached"
            className="h-16 w-16 rounded-lg object-cover"
          />
          <span className="flex-1 text-sm text-ink-muted">Photo attached</span>
          <button
            type="button"
            onClick={clear}
            className="cursor-pointer text-sm font-semibold text-ink-muted hover:text-danger"
          >
            Remove
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-row items-center justify-center gap-2 rounded-md border border-dashed border-surface-border py-3 text-sm font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          {upload.isPending ? 'Uploading…' : '📷 Add a photo (optional)'}
        </label>
      )}

      <ErrorText message={upload.error?.message} />
    </div>
  );
}

/**
 * The proof, as the reviewer sees it — and the one place a photo can be
 * reported.
 *
 * The report control is an icon on the image rather than another line of text
 * under the task. "Report this task" already exists below and means the work
 * was not done; this means *this picture should not be here*, which is a
 * different claim, needs to be reachable in one tap, and has to be obvious
 * without reading anything. It opens the same sheet — one report path, with the
 * reason carrying which of the two it was.
 */
function ProofView({
  task,
  onReport,
}: {
  task: Task;
  onReport: () => void;
}) {
  const imageUrl = useProofImage(task.id, Boolean(task.proofImageKey));

  if (!task.proofText && !task.proofImageKey) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
      <div className="flex flex-row items-start justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted">Proof</p>
        {task.proofImageKey ? (
          <button
            type="button"
            aria-label="Report this photo as inappropriate"
            title="Report this photo as inappropriate"
            onClick={onReport}
            className="-mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface hover:text-danger"
          >
            <span aria-hidden="true" className="text-base">
              ⚑
            </span>
          </button>
        ) : null}
      </div>

      {task.proofText ? <p className="text-sm text-ink">{task.proofText}</p> : null}

      {task.proofImageKey ? (
        imageUrl ? (
          /* The bytes come from an authenticated fetch as an object URL,
             which next/image cannot take. */
          <img
            src={imageUrl}
            alt={`Proof photo for ${task.title}`}
            className="max-h-72 w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg bg-surface text-xs text-ink-subtle">
            Loading photo…
          </div>
        )
      ) : null}
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
      <div className="flex flex-col rounded-lg border border-success bg-surface p-3">
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
      <ProofView task={task} onReport={() => setReporting(true)} />

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
