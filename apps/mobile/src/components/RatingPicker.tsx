import { Pressable, Text, View } from 'react-native';

import { CREDITS_PER_RATING_POINT, MAX_RATING, MIN_RATING } from '@buddy/shared';

/**
 * The 0-5 rating a reviewer gives on approval (§2.4). The credit value is shown
 * next to it, because that is what the rating actually does — and because 0 is a
 * meaningful choice (it approves the task but earns nothing), not a missing one.
 */
export function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  const ratings = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => MIN_RATING + i);

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        {ratings.map((rating) => {
          const active = value === rating;
          return (
            <Pressable
              key={rating}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Rate ${rating} out of ${MAX_RATING}`}
              onPress={() => onChange(rating)}
              className={`h-11 flex-1 items-center justify-center rounded-xl border ${
                active ? 'border-brand bg-brand' : 'border-surface-border bg-surface'
              }`}
            >
              <Text
                className={`text-base font-semibold ${active ? 'text-brand-fg' : 'text-ink'}`}
              >
                {rating}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-ink-subtle">
        {value === null
          ? 'Pick a rating'
          : value === 0
            ? 'Approves the task, but earns no credits'
            : `Earns ${value * CREDITS_PER_RATING_POINT} credits`}
      </Text>
    </View>
  );
}
