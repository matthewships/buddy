import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient, startCachePersistence } from '@/api/queryClient';
import { useSession } from '@/auth/store';
import { configureNotificationHandler, registerForPush } from '@/push/register';
import { useNotificationRouting } from '@/push/useNotificationRouting';

configureNotificationHandler();

export default function RootLayout() {
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    startCachePersistence();
    void restore();
  }, [restore]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <PushBridge />
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Registers the push token once signed in, and wires notification taps to
 * routes. It lives inside the providers because it needs the router and the
 * query client, and renders nothing.
 */
function PushBridge() {
  const status = useSession((s) => s.status);
  useNotificationRouting();

  useEffect(() => {
    // Registering before sign-in would 401: the token is stored against a user.
    if (status === 'signedIn') void registerForPush();
  }, [status]);

  return null;
}
