import { Pressable, Text, View } from 'react-native';

import { GOALS, OCCUPATIONS } from '@buddy/shared';

import type { BuddyCard as BuddyCardData } from '@/api/buddies';

import { Avatar } from './Avatar';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * A directory card (§2.2). Goal and occupation are the first two lines, because
 * they are the facts a prospective buddy actually decides on.
 */
export function BuddyCard({
  buddy,
  onPress,
  right,
}: {
  buddy: BuddyCardData;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const goal = buddy.goalText?.trim() || label(GOALS, buddy.goalKey);
  const occupation = buddy.occupationText?.trim() || label(OCCUPATIONS, buddy.occupationKey);
  const isActive = buddy.activity === 'Active now';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${buddy.displayName}, ${goal ?? 'no goal set'}`}
      onPress={onPress}
      className="rounded-2xl border border-surface-border bg-surface p-4 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-3">
        <Avatar avatarKey={buddy.avatarKey} displayName={buddy.displayName} size={44} />
        <View className="flex-1">
          <Text className="text-lg font-bold text-ink">{buddy.displayName}</Text>
          <Text className="text-sm text-ink-subtle">@{buddy.handle}</Text>

          {goal ? <Text className="mt-2 text-base text-ink">{goal}</Text> : null}
          {occupation ? <Text className="text-sm text-ink-muted">{occupation}</Text> : null}
          {buddy.headline ? (
            <Text className="mt-1 text-sm italic text-ink-muted">{buddy.headline}</Text>
          ) : null}

          <View className="mt-2 flex-row items-center gap-2">
            <View
              className={`h-2 w-2 rounded-full ${isActive ? 'bg-success' : 'bg-ink-subtle'}`}
            />
            <Text className="text-xs text-ink-subtle">{buddy.activity}</Text>
          </View>

          <Text className="mt-1 text-xs text-ink-subtle">
            {buddy.stats.totalCredits} credits · {buddy.stats.currentStreak} day streak ·{' '}
            {buddy.stats.reviewsGiven} reviews
          </Text>
        </View>

        {right}
      </View>
    </Pressable>
  );
}
