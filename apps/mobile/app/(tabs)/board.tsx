import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { useMe } from '@/api/auth';
import { useLeaderboard, type LeaderboardScope } from '@/api/board';
import { Avatar, Card, Screen } from '@/components';

export default function Board() {
  const [scope, setScope] = useState<LeaderboardScope>('weekly');
  const board = useLeaderboard(scope);
  const me = useMe();

  return (
    <Screen>
      <FlatList
        data={board.data?.entries ?? []}
        keyExtractor={(item) => item.userId}
        contentContainerClassName="gap-2 pb-8"
        refreshing={board.isRefetching}
        onRefresh={() => void board.refetch()}
        ListHeaderComponent={
          <View className="gap-3">
            <Text className="mb-1 mt-2 text-2xl font-bold text-ink">Board</Text>

            <View className="flex-row gap-2">
              <ScopeTab
                label="This week"
                active={scope === 'weekly'}
                onPress={() => setScope('weekly')}
              />
              <ScopeTab
                label="All time"
                active={scope === 'alltime'}
                onPress={() => setScope('alltime')}
              />
            </View>

            {board.data ? (
              <Card>
                <Text className="text-sm font-semibold text-ink-muted">Your position</Text>
                <Text className="mt-1 text-2xl font-bold text-ink">
                  {board.data.me.rank !== null ? `#${board.data.me.rank}` : 'Unranked'}
                </Text>
                <Text className="text-sm text-ink-muted">
                  {board.data.me.credits} credits{' '}
                  {scope === 'weekly' ? 'this week' : 'all time'}
                  {board.data.me.rank === null
                    ? ' · get a task approved to appear here'
                    : ''}
                </Text>
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View
            className={`flex-row items-center gap-3 rounded-2xl border p-3 ${
              item.userId === me.data?.id
                ? 'border-brand bg-brand-muted'
                : 'border-surface-border bg-surface'
            }`}
          >
            <Text className="w-9 text-base font-bold text-ink-muted">#{item.rank}</Text>
            <Avatar avatarKey={item.avatarKey} displayName={item.displayName} size={36} />
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{item.displayName}</Text>
              <Text className="text-xs text-ink-subtle">
                @{item.handle} · {item.currentStreak} day streak
              </Text>
            </View>
            <Text className="text-base font-bold text-ink">{item.credits}</Text>
          </View>
        )}
        ListEmptyComponent={
          board.isPending ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : (
            <Card>
              <Text className="text-base text-ink">
                Nobody has earned credits {scope === 'weekly' ? 'this week' : 'yet'}.
              </Text>
              <Text className="mt-1 text-sm text-ink-subtle">
                Get a task approved to be the first.
              </Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}

function ScopeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-1 items-center rounded-xl border py-2.5 ${
        active ? 'border-brand bg-brand' : 'border-surface-border bg-surface'
      }`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-brand-fg' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
