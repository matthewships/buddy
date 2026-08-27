import { Text, View } from 'react-native';

import { Card, Screen } from '@/components';

/** Phase 0 placeholder for the Profile tab (§5.2). */
export default function Profile() {
  return (
    <Screen>
      <Text className="mb-4 mt-2 text-2xl font-bold text-ink">Profile</Text>
      <Card>
        <View className="gap-1">
          <Text className="text-base text-ink">Your stats, streak, goal and buddy profile.</Text>
          <Text className="text-sm text-ink-subtle">Built out in a later phase.</Text>
        </View>
      </Card>
    </Screen>
  );
}
