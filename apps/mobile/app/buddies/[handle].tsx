import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { GOALS, MAX_REQUEST_MESSAGE, OCCUPATIONS } from '@buddy/shared';

import { useCurrentRequest, useSendRequest } from '@/api/buddies';
import { useProfile } from '@/api/users';
import { Button, Card, ErrorText, Field, Screen } from '@/components';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * The full buddy profile a user reads before sending a request (§2.2).
 *
 * The Request button is disabled while another request is pending, mirroring the
 * server's one-at-a-time rule rather than letting the user hit a 409.
 */
export default function BuddyProfile() {
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const profile = useProfile(handle);
  const current = useCurrentRequest();
  const sendRequest = useSendRequest();

  const [message, setMessage] = useState('');

  if (profile.isPending) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="text-base text-danger">
            {profile.error?.message ?? "Couldn't load that profile."}
          </Text>
          <Button label="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const person = profile.data;
  const goal = person.goalText?.trim() || label(GOALS, person.goalKey);
  const occupation = person.occupationText?.trim() || label(OCCUPATIONS, person.occupationKey);
  const hasPending = Boolean(current.data?.request);
  const alreadySent = sendRequest.isSuccess;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-3 pb-8">
        <View className="mt-2">
          <Text className="text-3xl font-bold text-ink">{person.displayName}</Text>
          <Text className="text-base text-ink-subtle">@{person.handle}</Text>
        </View>

        <Card>
          {goal ? <Text className="text-lg text-ink">{goal}</Text> : null}
          {occupation ? <Text className="text-base text-ink-muted">{occupation}</Text> : null}
          {person.buddyProfile?.headline ? (
            <Text className="mt-2 text-base italic text-ink-muted">
              {person.buddyProfile.headline}
            </Text>
          ) : null}
        </Card>

        {person.buddyProfile?.about ? (
          <Card>
            <Text className="mb-1 text-sm font-semibold text-ink-muted">About</Text>
            <Text className="text-base text-ink">{person.buddyProfile.about}</Text>
          </Card>
        ) : null}

        {person.buddyProfile?.availability ? (
          <Card>
            <Text className="mb-1 text-sm font-semibold text-ink-muted">Usually around</Text>
            <Text className="text-base text-ink">{person.buddyProfile.availability}</Text>
          </Card>
        ) : null}

        <Card>
          <Text className="mb-2 text-sm font-semibold text-ink-muted">Track record</Text>
          <Text className="text-base text-ink">
            {person.stats.totalCredits} credits · {person.stats.currentStreak} day streak
          </Text>
          <Text className="text-sm text-ink-muted">
            {person.stats.tasksApproved} tasks approved · {person.stats.reviewsGiven} reviews given
          </Text>
          <Text className="mt-1 text-xs text-ink-subtle">
            Member since {new Date(person.memberSince).toLocaleDateString()}
          </Text>
        </Card>

        {person.badges.length > 0 ? (
          <Card>
            <Text className="mb-2 text-sm font-semibold text-ink-muted">Badges</Text>
            <View className="flex-row flex-wrap gap-2">
              {person.badges.map((badge) => (
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

        {person.isOpenBuddy ? (
          <View className="mt-2 gap-3">
            <Field
              label="Add a message (optional)"
              value={message}
              onChangeText={setMessage}
              maxLength={MAX_REQUEST_MESSAGE}
              placeholder="Want to keep each other honest?"
              editable={!hasPending && !alreadySent}
            />
            <ErrorText message={sendRequest.error?.message} />
            <Button
              label={
                alreadySent
                  ? 'Request sent'
                  : hasPending
                    ? 'You already have a request waiting'
                    : `Ask ${person.displayName} to be your buddy`
              }
              disabled={hasPending || alreadySent || sendRequest.isPending}
              loading={sendRequest.isPending}
              onPress={() =>
                sendRequest.mutate(
                  {
                    toUserId: person.id,
                    ...(message.trim() ? { message: message.trim() } : {}),
                  },
                  // Back to the directory, where the pinned card and countdown live.
                  { onSuccess: () => router.replace('/(tabs)/buddies') },
                )
              }
            />
            <Text className="text-center text-xs text-ink-subtle">
              They have 5 minutes to respond.
            </Text>
          </View>
        ) : (
          <Card>
            <Text className="text-base text-ink-muted">
              {person.displayName} isn&apos;t taking buddy requests right now.
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
