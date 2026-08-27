import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native';

import { GOALS, OCCUPATIONS } from '@buddy/shared';

import { useMe, useUpdateMe } from '@/api/auth';
import { useProfile } from '@/api/users';
import { useSession } from '@/auth/store';
import { Button, Card, Screen } from '@/components';

function labelFor(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

export default function Profile() {
  const router = useRouter();
  const me = useMe();
  const updateMe = useUpdateMe();
  const signOut = useSession((s) => s.signOut);
  // Stats and badges live on the public profile endpoint, so the same numbers a
  // prospective buddy sees are the ones shown here — no second source of truth.
  const stats = useProfile(me.data?.handle ?? '');

  if (me.isPending) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (me.isError || !me.data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-base text-danger">Couldn&apos;t load your profile.</Text>
          <Button label="Try again" variant="ghost" onPress={() => me.refetch()} />
        </View>
      </Screen>
    );
  }

  const profile = me.data;
  const goal = profile.goalText?.trim() || labelFor(GOALS, profile.goalKey);
  const occupation = profile.occupationText?.trim() || labelFor(OCCUPATIONS, profile.occupationKey);

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-3 pb-8">
        <Text className="mb-1 mt-2 text-2xl font-bold text-ink">Profile</Text>

        <Card>
          <Text className="text-xl font-bold text-ink">{profile.displayName}</Text>
          <Text className="text-base text-ink-muted">@{profile.handle}</Text>
          {goal ? <Text className="mt-2 text-base text-ink">{goal}</Text> : null}
          {occupation ? <Text className="text-sm text-ink-muted">{occupation}</Text> : null}
        </Card>

        <Card>
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">Open to buddy requests</Text>
              <Text className="text-sm text-ink-muted">
                {profile.isOpenBuddy
                  ? 'You appear in the buddy directory.'
                  : 'You are hidden from the directory.'}
              </Text>
            </View>
            <Switch
              value={profile.isOpenBuddy}
              disabled={updateMe.isPending}
              onValueChange={(isOpenBuddy) => updateMe.mutate({ isOpenBuddy })}
              accessibilityLabel="Open to buddy requests"
            />
          </View>
        </Card>

        <Card>
          <Text className="mb-2 text-sm font-semibold text-ink-muted">Stats</Text>
          {stats.isPending ? (
            <ActivityIndicator />
          ) : stats.data ? (
            <>
              <View className="flex-row justify-between">
                <StatBlock label="Credits" value={stats.data.stats.totalCredits} />
                <StatBlock label="Streak" value={`${stats.data.stats.currentStreak}d`} />
                <StatBlock label="Best" value={`${stats.data.stats.bestStreak}d`} />
              </View>
              <Text className="mt-3 text-sm text-ink-muted">
                {stats.data.stats.tasksApproved} tasks approved ·{' '}
                {stats.data.stats.reviewsGiven} reviews given
              </Text>
            </>
          ) : (
            <Text className="text-sm text-ink-subtle">Stats aren&apos;t available right now.</Text>
          )}
        </Card>

        {(stats.data?.badges.length ?? 0) > 0 ? (
          <Card>
            <Text className="mb-2 text-sm font-semibold text-ink-muted">Badges</Text>
            <View className="flex-row flex-wrap gap-2">
              {stats.data!.badges.map((badge) => (
                <View
                  key={badge.key}
                  className="rounded-full border border-surface-border bg-surface-muted px-3 py-1.5"
                >
                  <Text className="text-xs text-ink">
                    {badge.emoji} {badge.name}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <View className="mt-2 gap-3">
          <Button
            label="Sign out"
            variant="ghost"
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/welcome');
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-1">
      <Text className="text-2xl font-bold text-ink">{value}</Text>
      <Text className="text-xs text-ink-subtle">{label}</Text>
    </View>
  );
}
