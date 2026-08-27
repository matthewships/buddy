import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/api/client';

/**
 * Push registration (§4.6, §5.1).
 *
 * A buddy request expires in 5 minutes, so the notification is not a nicety —
 * it is how the recipient finds out in time. Registration failures are therefore
 * logged and swallowed rather than thrown: the app still works through polling,
 * and a permission refusal is a legitimate user choice, not an error state.
 */
export async function registerForPush(): Promise<string | null> {
  // A simulator has no push token; asking produces a confusing error.
  if (!Device.isDevice) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return null;

    if (Platform.OS === 'android') {
      // Android needs a channel before anything is delivered.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Buddy',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await api.api.me.devices.$post({
      json: {
        expoPushToken: token.data,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      },
    });

    return token.data;
  } catch (error) {
    console.warn('[push] registration failed', error);
    return null;
  }
}

/**
 * Foreground presentation. Buddy requests are time-critical, so they are shown
 * as a banner even while the app is open — the user may be on another tab.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
