import { Text, View } from 'react-native';

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
    <View className={`self-start rounded-full px-2.5 py-1 ${STATUS_STYLE[status]}`}>
      <Text className={`text-xs font-semibold ${STATUS_STYLE[status].split(' ')[1]}`}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
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
  children?: React.ReactNode;
}) {
  return (
    <View className="rounded-2xl border border-surface-border bg-surface p-4">
      <View className="gap-1">
        {showOwner ? (
          <Text className="text-sm font-semibold text-ink-muted">
            {task.ownerDisplayName} · {task.groupName}
          </Text>
        ) : (
          <Text className="text-xs text-ink-subtle">{task.groupName}</Text>
        )}

        <Text
          className={`text-base font-semibold ${
            task.status === 'approved' ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {task.title}
        </Text>

        {task.notes ? <Text className="text-sm text-ink-muted">{task.notes}</Text> : null}

        {task.proofText ? (
          <View className="mt-1 rounded-xl bg-surface-muted p-3">
            <Text className="text-xs font-semibold text-ink-muted">Proof</Text>
            <Text className="text-sm text-ink">{task.proofText}</Text>
          </View>
        ) : null}

        <View className="mt-1">
          <StatusPill status={task.status} />
        </View>
      </View>

      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}

export { STATUS_LABEL };
