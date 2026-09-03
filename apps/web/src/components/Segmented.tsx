'use client';

/**
 * A two-or-three-way choice that is always visible, for switching how a list is
 * ordered. A dropdown would hide the alternative behind a tap, and the whole
 * point of a sort control is that the other option is discoverable.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-row rounded-md border border-surface-border bg-surface-muted p-1"
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.key)}
            className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'bg-surface font-semibold text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
