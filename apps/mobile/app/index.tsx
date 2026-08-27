import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useMe } from '@/api/auth';
import { useSession } from '@/auth/store';

/**
 * The entry route picks the stack: auth, onboarding, or the tabs.
 *
 * Onboarding state comes from /me rather than from local state alone, so a user
 * who onboarded on another device is not asked again. While that first request
 * is in flight the store's cached value is used, which avoids a flash of the
 * wrong stack on a warm start.
 */
export default function Index() {
  const status = useSession((s) => s.status);
  const cachedOnboarded = useSession((s) => s.onboarded);
  const me = useMe();

  if (status === 'loading' || (status === 'signedIn' && me.isPending && !cachedOnboarded)) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-muted">
        <ActivityIndicator />
      </View>
    );
  }

  if (status === 'signedOut') return <Redirect href="/(auth)/welcome" />;

  const onboarded = me.data?.onboarded ?? cachedOnboarded;
  return <Redirect href={onboarded ? '/(tabs)/today' : '/(onboarding)/profile'} />;
}
