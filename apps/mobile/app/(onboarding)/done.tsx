import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useUpdateMe } from '@/api/auth';
import { Button, ErrorText, Screen } from '@/components';
import { draftToPatch, useDraft } from '@/onboarding/draft';

/**
 * The single write that saves everything collected across the onboarding
 * screens, and the point at which the API stamps `onboarded_at`.
 */
export default function OnboardingDone() {
  const router = useRouter();
  const draft = useDraft();
  const updateMe = useUpdateMe();

  const finish = () => {
    updateMe.mutate(draftToPatch(draft), {
      onSuccess: () => {
        draft.reset();
        router.replace('/(tabs)/today');
      },
    });
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text className="text-3xl font-bold text-ink">You&apos;re all set</Text>
        <Text className="text-base text-ink-muted">
          @{draft.handle.toLowerCase()} · {draft.goalText.trim() || 'Goal set'}
        </Text>
        <Text className="text-base text-ink-muted">
          Next: add today&apos;s tasks, then find a buddy to keep you honest.
        </Text>

        <ErrorText message={updateMe.error?.message} />

        <View className="mt-6">
          <Button
            label="Finish"
            onPress={finish}
            loading={updateMe.isPending}
            disabled={updateMe.isPending}
          />
        </View>
      </View>
    </Screen>
  );
}
