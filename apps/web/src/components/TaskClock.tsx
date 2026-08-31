'use client';

import { useEffect, useState } from 'react';

import { serverNow } from '@/hooks/useCountdown';

/**
 * The clock on a running task (§2.4).
 *
 * Separate from `useCountdown`, which powers the buddy-request timer, because
 * the two want opposite things: that one floors at zero and formats `m:ss` for
 * a five-minute window, and this one runs for hours and has to keep going
 * *past* zero. What they share is `serverNow()` — the offset measured against
 * the server's clock, so a device whose time is wrong by an hour still shows
 * the right remaining time.
 *
 * Overrun is shown, not punished. The task stays open and can still be finished
 * and approved; the display turns red and counts up, and nothing else happens.
 * Waiting it out is deliberately not an escape from the chat lock either — the
 * only ways out are finishing or abandoning, and one of those costs points.
 */
export function TaskClock({
  startedAt,
  estimatedMinutes,
}: {
  startedAt: string;
  estimatedMinutes: number;
}) {
  const target = Date.parse(startedAt) + estimatedMinutes * 60_000;
  const [remainingMs, setRemainingMs] = useState(() => target - serverNow());

  useEffect(() => {
    // Every second: the seconds digit is visibly moving, which is most of what
    // makes a clock feel like a commitment rather than a label.
    const tick = () => setRemainingMs(target - serverNow());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const over = remainingMs < 0;

  return (
    <span
      // Polite, not assertive: a clock that interrupts a screen reader every
      // second would make the screen unusable.
      aria-live="polite"
      className={`font-mono text-sm tabular-nums ${over ? 'font-bold text-danger' : 'text-ink'}`}
    >
      {over ? `+${formatClock(-remainingMs)} over` : formatClock(remainingMs)}
    </span>
  );
}

/** `h:mm:ss` once there is an hour to show, `m:ss` below that. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "1h 30m", for an estimate that is not running yet. */
export function formatEstimate(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
