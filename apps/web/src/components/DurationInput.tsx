'use client';

import { useId } from 'react';

import { MAX_TASK_MINUTES, MIN_TASK_MINUTES } from '@buddy/shared';

/**
 * How long a task will take, typed as hours and minutes (§2.4).
 *
 * Two fields rather than one "minutes" box, because nobody thinks of an
 * afternoon's work as 210 minutes — and two fields rather than a preset list,
 * because the estimate is a commitment the owner is held to, and rounding
 * someone's honest 25 minutes up to a button marked 30 makes it slightly less
 * theirs.
 *
 * The value is carried as total minutes, which is what the API stores and what
 * the clock counts down. Hours and minutes are only how it is entered.
 */
export function DurationInput({
  minutes,
  onChange,
  error,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  error?: string | null;
}) {
  const id = useId();

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  /**
   * Digits only, and an empty field reads as zero rather than NaN — clearing a
   * box to retype it is the normal way to edit a number, and it should not
   * blank the other half or reject the form mid-edit.
   */
  const parse = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    return digits === '' ? 0 : Number(digits);
  };

  const set = (nextHours: number, nextMinutes: number) => {
    // Clamped on the way in, so the value handed upward is always storable.
    // Minutes are allowed past 59 as they are typed — someone entering "90"
    // means an hour and a half, and correcting that to 1:30 is friendlier than
    // refusing the keystroke.
    const total = Math.min(MAX_TASK_MINUTES, nextHours * 60 + nextMinutes);
    onChange(total);
  };

  const box =
    'w-16 rounded-md border border-surface-border bg-surface px-3 py-2 text-center text-base text-ink outline-none focus:border-brand';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-ink-muted">How long will it take?</p>

      <div className="flex flex-row items-center gap-2">
        <input
          id={`${id}-hours`}
          value={String(hours)}
          onChange={(event) => set(parse(event.target.value), mins)}
          inputMode="numeric"
          aria-label="Hours"
          aria-invalid={Boolean(error)}
          className={box}
        />
        <label htmlFor={`${id}-hours`} className="text-sm text-ink-muted">
          h
        </label>

        <input
          id={`${id}-minutes`}
          value={String(mins)}
          onChange={(event) => set(hours, parse(event.target.value))}
          inputMode="numeric"
          aria-label="Minutes"
          aria-invalid={Boolean(error)}
          className={box}
        />
        <label htmlFor={`${id}-minutes`} className="text-sm text-ink-muted">
          m
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-subtle">
          Between {MIN_TASK_MINUTES} minutes and {MAX_TASK_MINUTES / 60} hours.
        </p>
      )}
    </div>
  );
}

/** The reason a duration cannot be used, or null when it can. */
export function durationError(minutes: number): string | null {
  if (minutes < MIN_TASK_MINUTES) return `At least ${MIN_TASK_MINUTES} minutes`;
  if (minutes > MAX_TASK_MINUTES) return `At most ${MAX_TASK_MINUTES / 60} hours`;
  return null;
}
