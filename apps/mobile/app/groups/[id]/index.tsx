import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { handleSchema } from '@buddy/shared';

import { useGroup, useInviteToGroup, useLeaveGroup } from '@/api/groups';
import { localToday, useGroupTasks, type Task as GroupTask } from '@/api/tasks';
import { Avatar, Button, Card, ErrorText, Field, Screen, StatusPill } from '@/components';
import { activityLabel } from '@/lib/activity';

export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const invite = useInviteToGroup(id);
  const leave = useLeaveGroup();

  const [handle, setHandle] = useState('');
  const handleValid = handleSchema.safeParse(handle).success;

  if (group.isPending) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (group.isError || !group.data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-base text-danger">
            {group.error?.message ?? "Couldn't load that group."}
          </Text>
          <Button label="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const { group: info, members } = group.data;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-3 pb-8">
        <View className="mt-2">
          <Text className="text-3xl font-bold text-ink">
            {info.emoji ? `${info.emoji} ` : ''}
            {info.name}
          </Text>
          <Text className="text-sm text-ink-subtle">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>

        <Card>
          <Text className="mb-2 text-sm font-semibold text-ink-muted">Members</Text>
          {members.map((member) => (
            <View
              key={member.id}
              className="flex-row items-center gap-3 border-t border-surface-border py-2 first:border-t-0"
            >
              <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={40} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink">
                  {member.displayName}
                  {member.role === 'owner' ? ' · owner' : ''}
                </Text>
                <Text className="text-sm text-ink-muted">
                  @{member.handle}
                  {member.goalText ? ` · ${member.goalText}` : ''}
                </Text>
                <Text className="text-xs text-ink-subtle">{activityLabel(member.lastSeenAt)}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Text className="mb-2 text-sm font-semibold text-ink-muted">Invite by @handle</Text>
          <Field
            label="Handle"
            value={handle}
            onChangeText={(value) => setHandle(value.replace(/[^A-Za-z0-9_]/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="theirhandle"
          />
          <ErrorText message={invite.error?.message} />
          {invite.isSuccess ? (
            <Text className="text-sm text-success">Invite sent to @{invite.data.handle}</Text>
          ) : null}
          <View className="mt-3">
            <Button
              label="Send invite"
              variant="secondary"
              disabled={!handleValid || invite.isPending}
              loading={invite.isPending}
              onPress={() => invite.mutate(handle, { onSuccess: () => setHandle('') })}
            />
          </View>
        </Card>

        <GroupTaskBoard groupId={id} />

        <Card>
          <Text className="mb-2 text-sm font-semibold text-ink-muted">Chat</Text>
          <Button
            label="Open chat"
            variant="secondary"
            onPress={() => router.push(`/groups/${id}/chat`)}
          />
        </Card>

        <View className="mt-2">
          <Button
            label="Leave group"
            variant="ghost"
            disabled={leave.isPending}
            onPress={() =>
              leave.mutate(id, { onSuccess: () => router.replace('/(tabs)/groups') })
            }
          />
        </View>
      </ScrollView>
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
        <ActivityIndicator />
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
      <Text className="mb-2 text-sm font-semibold text-ink-muted">Tasks by day</Text>
      {days.length === 0 ? (
        <Text className="text-sm text-ink-subtle">
          Nobody has planned anything in this group yet.
        </Text>
      ) : (
        <View className="gap-3">
          {days.slice(0, 7).map(([day, dayTasks]) => (
            <View key={day} className="gap-1.5">
              <Text className="text-xs font-semibold uppercase text-ink-subtle">
                {formatDay(day)}
              </Text>
              {dayTasks.map((task) => (
                <View key={task.id} className="flex-row items-start gap-2">
                  <Text className="flex-1 text-sm text-ink">
                    <Text className="font-semibold">{task.ownerDisplayName}</Text> · {task.title}
                  </Text>
                  <StatusPill status={task.status} />
                </View>
              ))}
            </View>
          ))}
        </View>
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
