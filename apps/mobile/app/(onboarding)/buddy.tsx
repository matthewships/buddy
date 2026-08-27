import { useRouter } from 'expo-router';
import { Switch, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * "Are you willing to be someone's buddy?" (§2.1 step 5). Goal and occupation
 * are collected from everyone because they drive matching in both directions;
 * only open buddies fill in a buddy profile.
 */
export default function OnboardingBuddyToggle() {
  const router = useRouter();
  const draft = useDraft();

  return (
    <Screen>
      <View className="gap-4">
        <Text className="mt-4 text-3xl font-bold text-ink">Want to be a buddy?</Text>
        <Text className="text-base text-ink-muted">
          Open buddies appear in the directory so people looking for accountability can send you a
          request. You can change this any time.
        </Text>

        <Card>
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">Show me in the directory</Text>
              <Text className="text-sm text-ink-muted">
                {draft.isOpenBuddy
                  ? 'People can send you buddy requests.'
                  : 'You can still create groups and invite people you know.'}
              </Text>
            </View>
            <Switch
              value={draft.isOpenBuddy}
              onValueChange={(isOpenBuddy) => draft.set({ isOpenBuddy })}
              accessibilityLabel="Show me in the buddy directory"
            />
          </View>
        </Card>

        <Button
          label="Continue"
          onPress={() =>
            router.push(draft.isOpenBuddy ? '/(onboarding)/buddy-profile' : '/(onboarding)/done')
          }
        />
      </View>
    </Screen>
  );
}
