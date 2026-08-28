import type { ReactNode } from 'react';

import type { Task, TaskStatus } from '@/api/tasks';

const STATUS_LABEL: Record<TaskStatus, string> = {
  planned: 'Planned',
  done: 'Waiting for review',
  proof_requested: 'Proof requested',
  approved: 'Approved',
  missed: 'Missed',
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  planned: 'bg-surface-muted text-ink-muted',
  done: 'bg-brand-muted text-brand',
  proof_requested: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  missed: 'bg-danger/15 text-danger',
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * One task in a list. Used for both the owner's own tasks and buddies' tasks in
 * the review queue, with the actions passed in as children — the row itself
 * makes no assumptions about who is looking at it.
 */
export function TaskRow({
  task,
  showOwner = false,
  children,
}: {
  task: Task;
  showOwner?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-surface-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        {showOwner ? (
          <p className="text-sm font-semibold text-ink-muted">
            {task.ownerDisplayName} · {task.groupName}
          </p>
        ) : (
          <p className="text-xs text-ink-subtle">{task.groupName}</p>
        )}

        <p
          className={`text-base font-semibold ${
            task.status === 'approved' ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {task.title}
        </p>

        {task.notes ? <p className="text-sm text-ink-muted">{task.notes}</p> : null}

        {task.proofText ? (
          <div className="mt-1 flex flex-col rounded-xl bg-surface-muted p-3">
            <p className="text-xs font-semibold text-ink-muted">Proof</p>
            <p className="text-sm text-ink">{task.proofText}</p>
          </div>
        ) : null}

        <div className="mt-1 flex">
          <StatusPill status={task.status} />
        </div>
      </div>

      {children ? <div className="mt-3 flex flex-col gap-2">{children}</div> : null}
    </div>
  );
}

export { STATUS_LABEL };
