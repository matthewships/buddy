'use client';

import { CREDITS_PER_RATING_POINT, MAX_RATING, MIN_RATING } from '@buddy/shared';

/**
 * The 0-5 rating a reviewer gives on approval (§2.4). The credit value is shown
 * next to it, because that is what the rating actually does — and because 0 is a
 * meaningful choice (it approves the task but earns nothing), not a missing one.
 */
export function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  const ratings = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => MIN_RATING + i);

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Rating" className="flex flex-row gap-2">
        {ratings.map((rating) => {
          const active = value === rating;
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Rate ${rating} out of ${MAX_RATING}`}
              onClick={() => onChange(rating)}
              className={`h-11 flex-1 cursor-pointer rounded-md border text-base font-semibold transition-colors ${
                active
                  ? 'border-brand bg-brand text-brand-fg'
                  : 'border-surface-border bg-surface text-ink hover:border-brand'
              }`}
            >
              {rating}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-subtle">
        {value === null
          ? 'Pick a rating'
          : value === 0
            ? 'Approves the task, but earns no credits'
            : `Earns ${value * CREDITS_PER_RATING_POINT} credits`}
      </p>
    </div>
  );
}
