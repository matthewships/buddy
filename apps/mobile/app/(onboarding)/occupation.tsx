import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { MAX_OCCUPATION_TEXT, OCCUPATIONS } from '@buddy/shared';

import { Button, Chips, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingOccupation() {
  const router = useRouter();
  const draft = useDraft();

  const needsText = draft.occupationKey === 'custom';
  const canContinue =
    draft.occupationKey !== null && (!needsText || draft.occupationText.trim().length > 0);

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Text className="mt-4 text-3xl font-bold text-ink">What do you do?</Text>
        <Text className="text-base text-ink-muted">
          Buddies with similar lives tend to keep similar hours.
        </Text>

        <Chips
          options={OCCUPATIONS}
          selected={draft.occupationKey}
          onSelect={(occupationKey) => draft.set({ occupationKey })}
        />

        <Field
          label={needsText ? 'What you do' : 'Field or job title (optional)'}
          value={draft.occupationText}
          onChangeText={(occupationText) => draft.set({ occupationText })}
          maxLength={MAX_OCCUPATION_TEXT}
          placeholder={needsText ? 'Nurse, night shifts' : 'e.g. Computer science'}
        />

        <Button
          label="Continue"
          disabled={!canContinue}
          onPress={() => router.push('/(onboarding)/buddy')}
        />
      </ScrollView>
    </Screen>
  );
}
