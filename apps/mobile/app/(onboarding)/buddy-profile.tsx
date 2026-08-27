import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { MAX_ABOUT, MAX_AVAILABILITY, MAX_HEADLINE } from '@buddy/shared';

import { Button, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingBuddyProfile() {
  const router = useRouter();
  const draft = useDraft();

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Text className="mt-4 text-3xl font-bold text-ink">Your buddy profile</Text>
        <Text className="text-base text-ink-muted">
          This is what someone reads before sending you a request. All optional.
        </Text>

        <Field
          label="Headline"
          value={draft.headline}
          onChangeText={(headline) => draft.set({ headline })}
          maxLength={MAX_HEADLINE}
          placeholder="Thesis by December, up at 6am"
        />
        <Field
          label="About you"
          value={draft.about}
          onChangeText={(about) => draft.set({ about })}
          maxLength={MAX_ABOUT}
          multiline
          numberOfLines={4}
          className="min-h-24 rounded-xl border border-surface-border bg-surface px-4 py-3 text-base text-ink"
          placeholder="A few sentences about what you're doing and how you like to be held to it."
        />
        <Field
          label="When you're around"
          value={draft.availability}
          onChangeText={(availability) => draft.set({ availability })}
          maxLength={MAX_AVAILABILITY}
          placeholder="Evenings, weekdays"
        />

        <Button label="Continue" onPress={() => router.push('/(onboarding)/done')} />
      </ScrollView>
    </Screen>
  );
}
