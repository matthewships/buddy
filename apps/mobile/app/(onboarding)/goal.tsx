import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { GOALS, MAX_GOAL_TEXT } from '@buddy/shared';

import { Button, Chips, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingGoal() {
  const router = useRouter();
  const draft = useDraft();

  // A `custom` goal must carry text — the same rule the API enforces (§2.1).
  const needsText = draft.goalKey === 'custom';
  const canContinue =
    draft.goalKey !== null && (!needsText || draft.goalText.trim().length > 0);

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Text className="mt-4 text-3xl font-bold text-ink">What are you working toward?</Text>
        <Text className="text-base text-ink-muted">
          This is the first thing a buddy sees, and it drives who we match you with.
        </Text>

        <Chips
          options={GOALS}
          selected={draft.goalKey}
          onSelect={(goalKey) => draft.set({ goalKey })}
        />

        <Field
          label={needsText ? 'Your goal' : 'Add a detail (optional)'}
          value={draft.goalText}
          onChangeText={(goalText) => draft.set({ goalText })}
          maxLength={MAX_GOAL_TEXT}
          placeholder={needsText ? 'Finish my dissertation' : 'e.g. Organic chemistry finals'}
        />

        <Button
          label="Continue"
          disabled={!canContinue}
          onPress={() => router.push('/(onboarding)/occupation')}
        />
      </ScrollView>
    </Screen>
  );
}
