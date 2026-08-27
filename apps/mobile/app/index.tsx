import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/auth/store';

/**
 * The entry route decides which stack the user lands in. Onboarding (goal,
 * occupation, buddy profile) is inserted here in Phase 1, once /me can report
 * whether it has been completed.
 */
export default function Index() {
  const status = useSession((s) => s.status);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-muted">
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={status === 'signedIn' ? '/(tabs)/today' : '/(auth)/welcome'} />;
}
