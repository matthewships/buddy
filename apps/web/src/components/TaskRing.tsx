'use client';

import { useEffect, useState } from 'react';

import { serverNow } from '@/hooks/useCountdown';

import { formatClock } from './TaskClock';

/**
 * Inside the ring, where six or seven characters do not fit: `h:mm` once there
 * is an hour to show, `m:ss` below that. Tasks run up to twelve hours, so
 * `formatClock`'s `h:mm:ss` would overflow the circle on a routine 90-minute
 * task rather than an exotic one. The seconds still tick where they fit, which
 * is the hour of the task where a moving digit means anything.
 */
function compactClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 3600) return formatClock(ms);
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}`;
}

/**
 * The clock on a running task, drawn as a ring that fills as the time goes (§2.4).
 *
 * A number alone tells you how long is left; the ring tells you how much of the
 * commitment is *spent*, which is the thing a glance is actually asking. So the
 * arc grows rather than drains — at a glance, an almost-empty ring is early and
 * an almost-full one is nearly out of time, with no digits to read.
 *
 * Colour carries the same story a second way, for the same glance: brand while
 * there is room, amber inside the last quarter, red once it has overrun. That
 * is redundant with the arc on purpose — a ring at 78% and a ring at 92% are
 * hard to tell apart, and the colour change is not.
 *
 * Overrun is shown, not punished: the ring completes, turns red and counts up,
 * and the task stays open and finishable. Waiting it out is deliberately not an
 * escape from the chat lock either — the only ways out are finishing or
 * abandoning, and one of those costs points.
 *
 * Time comes from `serverNow()`, the offset measured against the server's
 * clock, so a device whose time is wrong by an hour still shows the right
 * remaining time — the same source the text clock uses.
 */
export function TaskRing({
  startedAt,
  estimatedMinutes,
  size = 64,
}: {
  startedAt: string;
  estimatedMinutes: number;
  /** Diameter in px. The stroke and type scale with it. */
  size?: number;
}) {
  const startedMs = Date.parse(startedAt);
  const totalMs = estimatedMinutes * 60_000;
  const target = startedMs + totalMs;

  const [remainingMs, setRemainingMs] = useState(() => target - serverNow());

  useEffect(() => {
    // Every second: the seconds digit visibly moving is most of what makes a
    // clock feel like a commitment rather than a label.
    const tick = () => setRemainingMs(target - serverNow());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const over = remainingMs < 0;
  // Clamped at both ends: a clock started a second in the future (clock skew)
  // must not draw a negative arc, and an overrun one stays visually full.
  const elapsed = Math.min(1, Math.max(0, (totalMs - remainingMs) / totalMs));

  const stroke = Math.max(3, Math.round(size * 0.075));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const colour = over ? 'text-danger' : elapsed > 0.75 ? 'text-warning' : 'text-brand';
  const label = over ? `+${compactClock(-remainingMs)}` : compactClock(remainingMs);
  // The full form, seconds and all, is what a screen reader gets: it has the
  // room the ring does not.
  const spoken = over ? `${formatClock(-remainingMs)} over time` : `${formatClock(remainingMs)} left`;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      // One announcement for the pair, polite rather than assertive: a clock
      // that interrupts a screen reader every second makes a screen unusable.
      role="timer"
      aria-live="polite"
      aria-label={spoken}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        // Starts the arc at twelve o'clock rather than three.
        className={`-rotate-90 ${colour}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - elapsed)}
          // Only the sweep animates; the colour swap is instant, so a task
          // crossing into overrun reads as an event rather than a fade.
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>

      <span
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center font-mono tabular-nums ${colour} ${
          over ? 'font-bold' : 'font-semibold'
        }`}
        style={{ fontSize: Math.max(10, Math.round(size * 0.2)) }}
      >
        {label}
      </span>
    </div>
  );
}
