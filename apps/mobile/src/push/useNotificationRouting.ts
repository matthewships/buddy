import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { buddyKeys } from '@/api/buddies';
import { groupKeys } from '@/api/groups';

/**
 * Routes a notification tap to the right screen, and refreshes the queries the
 * notification implies are stale.
 *
 * The `url` in the payload is produced by the API alongside each push, so the
 * destination lives with the event that caused it rather than being re-derived
 * from a type string in two places.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateFor = (type: string | undefined) => {
      if (type === 'buddy_request') {
        void queryClient.invalidateQueries({ queryKey: buddyKeys.incoming });
      }
      if (type === 'buddy_accepted' || type === 'buddy_declined') {
        void queryClient.invalidateQueries({ queryKey: buddyKeys.current });
        void queryClient.invalidateQueries({ queryKey: groupKeys.all });
      }
      if (type === 'group_invite' || type === 'invite_accepted') {
        void queryClient.invalidateQueries({ queryKey: groupKeys.invites });
        void queryClient.invalidateQueries({ queryKey: groupKeys.all });
      }
    };

    // Arriving while the app is open: refresh, but don't yank the user around.
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { type?: string };
      invalidateFor(data.type);
    });

    // An actual tap is an intent to go there.
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        url?: string;
      };
      invalidateFor(data.type);
      if (data.url) router.push(data.url as never);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [router, queryClient]);
}
