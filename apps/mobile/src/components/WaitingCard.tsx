import { Text, View } from 'react-native';

import type { PendingRequest } from '@/api/buddies';
import { useCountdown } from '@/hooks/useCountdown';

import { Button } from './Button';

/**
 * The requester's pinned card while waiting (§2.2): "Waiting for Ana · 4:32".
 * The countdown runs on server time plus a measured offset, never the phone's
 * own clock — a 5-minute window can't tolerate clock skew.
 */
export function WaitingCard({
  request,
  onCancel,
  busy,
}: {
  request: PendingRequest;
  onCancel: () => void;
  busy: boolean;
}) {
  const countdown = useCountdown(request.expiresAt);

  return (
    <View className="rounded-2xl border border-brand bg-surface p-4">
      <Text className="text-base font-bold text-ink">
        Waiting for {request.user.displayName}
      </Text>
      <Text
        className="mt-1 text-2xl font-bold text-brand"
        accessibilityLabel={`${countdown.label} remaining`}
      >
        {countdown.expired ? 'No answer' : countdown.label}
      </Text>
      <Text className="mt-1 text-sm text-ink-muted">
        {countdown.expired
          ? `No answer from ${request.user.displayName} — try another buddy.`
          : 'We let them know. Other requests are paused until this one resolves.'}
      </Text>

      {!countdown.expired ? (
        <View className="mt-3">
          <Button label="Cancel request" variant="ghost" onPress={onCancel} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}
