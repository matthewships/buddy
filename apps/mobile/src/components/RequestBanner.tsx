import { Text, View } from 'react-native';

import type { PendingRequest } from '@/api/buddies';
import { useCountdown } from '@/hooks/useCountdown';

import { Button } from './Button';

/**
 * The incoming-request banner (§2.2). Shows the same server-driven countdown the
 * requester sees, so both sides agree on how long is left.
 */
export function RequestBanner({
  request,
  onAccept,
  onDecline,
  busy,
}: {
  request: PendingRequest;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const countdown = useCountdown(request.expiresAt);
  if (countdown.expired) return null;

  return (
    <View className="rounded-2xl border border-brand bg-brand-muted p-4">
      <Text className="text-base font-bold text-ink">
        {request.user.displayName} wants you as a buddy
      </Text>
      <Text className="text-sm text-ink-muted">
        @{request.user.handle}
        {request.user.goalText ? ` · ${request.user.goalText}` : ''}
      </Text>
      {request.message ? (
        <Text className="mt-2 text-sm italic text-ink">&ldquo;{request.message}&rdquo;</Text>
      ) : null}

      <Text className="mt-2 text-sm font-semibold text-brand">
        Respond within {countdown.label}
      </Text>

      <View className="mt-3 flex-row gap-2">
        <View className="flex-1">
          <Button label="Accept" onPress={onAccept} disabled={busy} />
        </View>
        <View className="flex-1">
          <Button label="Decline" variant="ghost" onPress={onDecline} disabled={busy} />
        </View>
      </View>
    </View>
  );
}
