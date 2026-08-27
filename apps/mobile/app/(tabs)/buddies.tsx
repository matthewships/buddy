import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Switch, Text, View } from 'react-native';

import { GOALS, OCCUPATIONS } from '@buddy/shared';

import {
  useBuddyDirectory,
  useCurrentRequest,
  useIncomingRequests,
  useRespondToRequest,
  type DirectoryFilters,
} from '@/api/buddies';
import { BuddyCard, Button, Card, RequestBanner, Screen, WaitingCard } from '@/components';

/**
 * The Buddies tab (§5.2).
 *
 * Three things share this screen because they are the same decision from
 * different sides: incoming requests to answer, an outgoing request to wait on,
 * and the directory to pick from. While a request is pending every "Request"
 * button is disabled — the API allows only one at a time, and the UI should say
 * so rather than let the user discover it through a 409.
 */
export default function Buddies() {
  const router = useRouter();
  const [goal, setGoal] = useState<string | null>(null);
  const [occupation, setOccupation] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo<DirectoryFilters>(
    () => ({
      ...(goal ? { goal } : {}),
      ...(occupation ? { occupation } : {}),
      ...(activeOnly ? { activeOnly: true } : {}),
    }),
    [goal, occupation, activeOnly],
  );

  const directory = useBuddyDirectory(filters);
  const current = useCurrentRequest();
  const incoming = useIncomingRequests();
  const respond = useRespondToRequest();

  const pending = current.data?.request ?? null;
  const outcome = current.data?.outcome ?? null;
  const buddies = directory.data?.pages.flatMap((page) => page.buddies) ?? [];

  const busy = respond.accept.isPending || respond.decline.isPending || respond.cancel.isPending;

  return (
    <Screen>
      <FlatList
        data={buddies}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 pb-8"
        onEndReached={() => {
          if (directory.hasNextPage && !directory.isFetchingNextPage) {
            void directory.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        refreshing={directory.isRefetching}
        onRefresh={() => void directory.refetch()}
        ListHeaderComponent={
          <View className="gap-3">
            <Text className="mb-1 mt-2 text-2xl font-bold text-ink">Buddies</Text>

            {incoming.data?.requests.map((request) => (
              <RequestBanner
                key={request.id}
                request={request}
                busy={busy}
                onAccept={() =>
                  respond.accept.mutate(request.id, {
                    onSuccess: (result) => router.push(`/groups/${result.group.id}`),
                  })
                }
                onDecline={() => respond.decline.mutate(request.id)}
              />
            ))}

            {pending ? (
              <WaitingCard
                request={pending}
                busy={busy}
                onCancel={() => respond.cancel.mutate(pending.id)}
              />
            ) : null}

            {/* A resolved request the user hasn't acted on yet. */}
            {!pending && outcome && outcome.status === 'accepted' && outcome.group ? (
              <Card className="border-success">
                <Text className="text-base font-bold text-ink">
                  {outcome.user?.displayName ?? 'Your buddy'} accepted
                </Text>
                <View className="mt-3">
                  <Button
                    label={`Open ${outcome.group.name}`}
                    onPress={() => router.push(`/groups/${outcome.group!.id}`)}
                  />
                </View>
              </Card>
            ) : null}

            {!pending && outcome && outcome.status !== 'accepted' ? (
              <Card>
                <Text className="text-base text-ink">
                  No answer from {outcome.user?.displayName ?? 'them'} — try another buddy.
                </Text>
              </Card>
            ) : null}

            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                onPress={() => setFiltersOpen((open) => !open)}
              >
                <Text className="text-base font-semibold text-brand">
                  {filtersOpen ? 'Hide filters' : 'Filters'}
                </Text>
              </Pressable>
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-ink-muted">Active in last 15 min</Text>
                <Switch
                  value={activeOnly}
                  onValueChange={setActiveOnly}
                  accessibilityLabel="Only show buddies active in the last 15 minutes"
                />
              </View>
            </View>

            {filtersOpen ? (
              <Card>
                <FilterRow
                  title="Goal"
                  options={GOALS}
                  selected={goal}
                  onSelect={(key) => setGoal(key === goal ? null : key)}
                />
                <View className="h-3" />
                <FilterRow
                  title="Occupation"
                  options={OCCUPATIONS}
                  selected={occupation}
                  onSelect={(key) => setOccupation(key === occupation ? null : key)}
                />
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <BuddyCard buddy={item} onPress={() => router.push(`/buddies/${item.handle}`)} />
        )}
        ListEmptyComponent={
          directory.isPending ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : (
            <Card>
              <Text className="text-base text-ink">No buddies match those filters yet.</Text>
              <Text className="mt-1 text-sm text-ink-subtle">
                Try clearing them, or check back when more people are around.
              </Text>
            </Card>
          )
        }
        ListFooterComponent={
          directory.isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function FilterRow({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: readonly { key: string; label: string }[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink-muted">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options
          .filter((option) => option.key !== 'custom')
          .map((option) => {
            const active = option.key === selected;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                onPress={() => onSelect(option.key)}
                className={`rounded-full border px-3 py-1.5 ${
                  active ? 'border-brand bg-brand' : 'border-surface-border bg-surface'
                }`}
              >
                <Text className={`text-xs ${active ? 'font-semibold text-brand-fg' : 'text-ink'}`}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}
