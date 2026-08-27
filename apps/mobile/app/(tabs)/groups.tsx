import { Text, View } from 'react-native';

import { Card, Screen } from '@/components';

/** Phase 0 placeholder for the Groups tab (§5.2). */
export default function Groups() {
  return (
    <Screen>
      <Text className="mb-4 mt-2 text-2xl font-bold text-ink">Groups</Text>
      <Card>
        <View className="gap-1">
          <Text className="text-base text-ink">Groups you share with people you know, each with its own chat.</Text>
          <Text className="text-sm text-ink-subtle">Built out in a later phase.</Text>
        </View>
      </Card>
    </Screen>
  );
}
