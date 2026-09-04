'use client';

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
    <div className="flex flex-col rounded-lg border border-brand bg-brand-muted p-4">
      <p className="text-base font-bold text-ink">
        {request.user.displayName} wants you as a buddy
      </p>
      <p className="text-sm text-ink-muted">
        @{request.user.handle}
        {request.user.goalText ? ` · ${request.user.goalText}` : ''}
      </p>
      {request.message ? (
        <p className="mt-2 text-sm italic text-ink">&ldquo;{request.message}&rdquo;</p>
      ) : null}

      <p className="mt-2 text-sm font-semibold text-brand">Respond within {countdown.label}</p>

      <div className="mt-3 flex flex-row gap-2">
        <Button label="Accept" onClick={onAccept} disabled={busy} className="flex-1" />
        <Button label="Decline" variant="ghost" onClick={onDecline} disabled={busy} className="flex-1" />
      </div>
    </div>
  );
}
