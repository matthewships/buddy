import type { TaskStatus } from '@/api/tasks';

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

export { STATUS_LABEL };
