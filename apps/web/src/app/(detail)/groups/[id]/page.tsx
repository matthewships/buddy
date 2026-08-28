'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { handleSchema } from '@buddy/shared';

import { useGroup, useInviteToGroup, useLeaveGroup } from '@/api/groups';
import { localToday, useGroupTasks, type Task as GroupTask } from '@/api/tasks';
import {
  Avatar,
  BackLink,
  Button,
  Card,
  ErrorText,
  Field,
  Screen,
  Spinner,
  StatusPill,
} from '@/components';
import { activityLabel } from '@/lib/activity';

export default function GroupDetail() {
  const router = useRouter();
  const id = useParams<{ id: string }>().id;

  const group = useGroup(id);
  const invite = useInviteToGroup(id);
  const leave = useLeaveGroup();

  const [handle, setHandle] = useState('');
  const handleValid = handleSchema.safeParse(handle).success;

  if (group.isPending) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (group.isError || !group.data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-base text-danger">
            {group.error?.message ?? "Couldn't load that group."}
          </p>
          <Button label="Go back" variant="ghost" onClick={() => router.replace('/groups')} />
        </div>
      </Screen>
    );
  }

  const { group: info, members } = group.data;

  return (
    <Screen>
      <BackLink fallback="/groups" label="Groups" />

      <div className="flex flex-col">
        <h1 className="text-3xl font-bold text-ink">
          {info.emoji ? `${info.emoji} ` : ''}
          {info.name}
        </h1>
        <p className="text-sm text-ink-subtle">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Members</p>
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-row items-center gap-3 border-t border-surface-border py-2 first:border-t-0"
          >
            <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={40} />
            <div className="flex flex-1 flex-col">
              <p className="text-base font-semibold text-ink">
                {member.displayName}
                {member.role === 'owner' ? ' · owner' : ''}
              </p>
              <p className="text-sm text-ink-muted">
                @{member.handle}
                {member.goalText ? ` · ${member.goalText}` : ''}
              </p>
              <p className="text-xs text-ink-subtle">{activityLabel(member.lastSeenAt)}</p>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Invite by @handle</p>
        <Field
          label="Handle"
          value={handle}
          onChangeText={(value) => setHandle(value.replace(/[^A-Za-z0-9_]/g, ''))}
          autoCapitalize="none"
          placeholder="theirhandle"
        />
        <ErrorText message={invite.error?.message} />
        {invite.isSuccess ? (
          <p className="text-sm text-success">Invite sent to @{invite.data.handle}</p>
        ) : null}
        <div className="mt-3">
          <Button
            label="Send invite"
            variant="secondary"
            disabled={!handleValid || invite.isPending}
            loading={invite.isPending}
            onClick={() => invite.mutate(handle, { onSuccess: () => setHandle('') })}
          />
        </div>
      </Card>

      <GroupTaskBoard groupId={id} />

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Chat</p>
        <Button
          label="Open chat"
          variant="secondary"
          onClick={() => router.push(`/groups/${id}/chat`)}
        />
      </Card>

      <div className="mt-2">
        <Button
          label="Leave group"
          variant="ghost"
          disabled={leave.isPending}
          onClick={() => leave.mutate(id, { onSuccess: () => router.replace('/groups') })}
        />
      </div>
    </Screen>
  );
}

/**
 * The group's tasks grouped by day (§5.2).
 *
 * Read-only here: acting on a task belongs on the Today tab, where the review
 * queue and the owner's own actions already live. This view exists so a member
 * can see how the group has actually been doing over the last few days.
 */
function GroupTaskBoard({ groupId }: { groupId: string }) {
  const tasks = useGroupTasks(groupId);

  if (tasks.isPending) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  const byDay = new Map<string, GroupTask[]>();
  for (const task of tasks.data?.tasks ?? []) {
    byDay.set(task.dueDate, [...(byDay.get(task.dueDate) ?? []), task]);
  }
  // The API returns due_date descending, so insertion order is already newest
  // first.
  const days = [...byDay.entries()];

  return (
    <Card>
      <p className="mb-2 text-sm font-semibold text-ink-muted">Tasks by day</p>
      {days.length === 0 ? (
        <p className="text-sm text-ink-subtle">Nobody has planned anything in this group yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {days.slice(0, 7).map(([day, dayTasks]) => (
            <div key={day} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase text-ink-subtle">{formatDay(day)}</p>
              {dayTasks.map((task) => (
                <div key={task.id} className="flex flex-row items-start gap-2">
                  <p className="flex-1 text-sm text-ink">
                    <span className="font-semibold">{task.ownerDisplayName}</span> · {task.title}
                  </p>
                  <StatusPill status={task.status} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function formatDay(date: string): string {
  const today = localToday();
  if (date === today) return 'Today';
  const yesterday = new Date(Date.parse(`${today}T00:00:00`) - 86_400_000);
  const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
    yesterday.getDate(),
  ).padStart(2, '0')}`;
  if (date === y) return 'Yesterday';
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
