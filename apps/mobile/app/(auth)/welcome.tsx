import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Screen } from '@/components';

export default function Welcome() {
  const router = useRouter();

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text className="text-4xl font-bold text-ink">Buddy</Text>
        <Text className="text-base text-ink-muted">
          Plan your day, get it approved by a buddy, build the streak.
        </Text>
        <View className="mt-8 gap-3">
          <Button label="Create an account" onPress={() => router.push('/(auth)/register')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/login')}
          />
        </View>
      </View>
    </Screen>
  );
}
