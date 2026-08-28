import { useEffect, useMemo, useState } from 'react';

/**
 * Counts down to a server-provided ISO timestamp (§5.1).
 *
 * The remaining time is computed from the server's `expiresAt` plus a measured
 * offset between the server clock and this device's clock — a phone whose clock
 * is wrong by minutes must not see a wrong countdown on a 5-minute window.
 * `setClockOffset` is called with the offset derived from a response's Date
 * header; until then the offset is 0 and the device clock is used as-is.
 */
let clockOffsetMs = 0;

export function setClockOffset(offsetMs: number): void {
  clockOffsetMs = offsetMs;
}

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

export interface Countdown {
  /** Whole milliseconds left, floored at 0. */
  remainingMs: number;
  /** `m:ss`, as shown under a buddy's name while a request is pending. */
  label: string;
  expired: boolean;
}

export function useCountdown(expiresAt: string | null | undefined): Countdown {
  const target = useMemo(() => (expiresAt ? Date.parse(expiresAt) : null), [expiresAt]);
  const [remainingMs, setRemainingMs] = useState(() =>
    target === null ? 0 : Math.max(0, target - serverNow()),
  );

  useEffect(() => {
    if (target === null) {
      setRemainingMs(0);
      return;
    }

    const tick = () => setRemainingMs(Math.max(0, target - serverNow()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [target]);

  return {
    remainingMs,
    label: formatRemaining(remainingMs),
    expired: target !== null && remainingMs <= 0,
  };
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
