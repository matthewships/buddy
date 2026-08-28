import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { handleSchema } from '@buddy/shared';

import { useGroup, useInviteToGroup, useLeaveGroup } from '@/api/groups';
import { Button, Card, ErrorText, Field, Screen } from '@/components';
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
            <View key={member.id} className="border-t border-surface-border py-2 first:border-t-0">
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
