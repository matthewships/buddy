import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import {
  useCreateGroup,
  useInvites,
  useRespondToInvite,
  type GroupSummary,
} from '@/api/groups';
import { Button, Card, ErrorText, Field, Screen } from '@/components';
import { useGroups } from '@/api/groups';

export default function Groups() {
  const router = useRouter();
  const groups = useGroups();
  const invites = useInvites();
  const createGroup = useCreateGroup();
  const respond = useRespondToInvite();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  return (
    <Screen>
      <FlatList
        data={groups.data?.groups ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 pb-8"
        refreshing={groups.isRefetching}
        onRefresh={() => void groups.refetch()}
        ListHeaderComponent={
          <View className="gap-3">
            <Text className="mb-1 mt-2 text-2xl font-bold text-ink">Groups</Text>

            {/* Pending invites sit above the list — they need a decision. */}
            {invites.data?.invites.map((invite) => (
              <Card key={invite.id} className="border-brand">
                <Text className="text-base font-bold text-ink">
                  {invite.fromDisplayName} invited you to {invite.groupName}
                </Text>
                <Text className="text-sm text-ink-muted">@{invite.fromHandle}</Text>
                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      label="Join"
                      disabled={respond.accept.isPending}
                      onPress={() =>
                        respond.accept.mutate(invite.id, {
                          onSuccess: (result) => {
                            if (result.group) router.push(`/groups/${result.group.id}`);
                          },
                        })
                      }
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      label="Decline"
                      variant="ghost"
                      disabled={respond.decline.isPending}
                      onPress={() => respond.decline.mutate(invite.id)}
                    />
                  </View>
                </View>
              </Card>
            ))}

            {creating ? (
              <Card>
                <Field
                  label="Group name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Finals crew"
                  autoFocus
                />
                <ErrorText message={createGroup.error?.message} />
                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      label="Create"
                      disabled={name.trim().length === 0 || createGroup.isPending}
                      loading={createGroup.isPending}
                      onPress={() =>
                        createGroup.mutate(
                          { name: name.trim() },
                          {
                            onSuccess: (result) => {
                              setName('');
                              setCreating(false);
                              router.push(`/groups/${result.group.id}`);
                            },
                          },
                        )
                      }
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      label="Cancel"
                      variant="ghost"
                      onPress={() => {
                        setCreating(false);
                        setName('');
                      }}
                    />
                  </View>
                </View>
              </Card>
            ) : (
              <Button label="New group" variant="secondary" onPress={() => setCreating(true)} />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <GroupRow group={item} onPress={() => router.push(`/groups/${item.id}`)} />
        )}
        ListEmptyComponent={
          groups.isPending ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : (
            <Card>
              <Text className="text-base text-ink">No groups yet.</Text>
              <Text className="mt-1 text-sm text-ink-subtle">
                Create one and invite people by @handle, or find a buddy in the Buddies tab.
              </Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}

function GroupRow({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  return (
    <Card>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg font-bold text-ink">
            {group.emoji ? `${group.emoji} ` : ''}
            {group.name}
          </Text>
          <Text className="text-sm text-ink-muted">
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
            {group.kind === 'matched' ? ' · matched buddy' : ''}
          </Text>
        </View>
        <Button label="Open" variant="ghost" onPress={onPress} />
      </View>
    </Card>
  );
}
