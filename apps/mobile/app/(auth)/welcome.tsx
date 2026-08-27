import { Text, View } from 'react-native';

import { Button, Screen } from '@/components';

/**
 * Phase 0 placeholder for the Welcome screen (§5.2). Register, verify, login,
 * forgot and reset arrive in Phase 1; this exists so the auth stack is
 * navigable and the styling pipeline is provably wired end to end.
 */
export default function Welcome() {
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text className="text-3xl font-bold text-ink">Buddy</Text>
        <Text className="text-base text-ink-muted">
          Plan your day, get it approved by a buddy, build the streak.
        </Text>
        <View className="mt-6 gap-3">
          <Button label="Create an account" disabled />
          <Button label="I already have an account" variant="ghost" disabled />
        </View>
        <Text className="mt-2 text-sm text-ink-subtle">Auth arrives in phase 1.</Text>
      </View>
    </Screen>
  );
}
