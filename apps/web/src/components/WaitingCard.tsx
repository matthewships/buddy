'use client';

import type { PendingRequest } from '@/api/buddies';
import { useCountdown } from '@/hooks/useCountdown';

import { Button } from './Button';

/**
 * The requester's pinned card while waiting (§2.2): "Waiting for Ana · 4:32".
 * The countdown runs on server time plus a measured offset, never the browser's
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
    <div className="flex flex-col rounded-2xl border border-brand bg-surface p-4">
      <p className="text-base font-bold text-ink">Waiting for {request.user.displayName}</p>
      <p
        className="mt-1 text-2xl font-bold text-brand"
        aria-label={`${countdown.label} remaining`}
        aria-live="off"
      >
        {countdown.expired ? 'No answer' : countdown.label}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {countdown.expired
          ? `No answer from ${request.user.displayName} — try another buddy.`
          : 'We let them know. Other requests are paused until this one resolves.'}
      </p>

      {!countdown.expired ? (
        <div className="mt-3">
          <Button label="Cancel request" variant="ghost" onClick={onCancel} disabled={busy} />
        </div>
      ) : null}
    </div>
  );
}
