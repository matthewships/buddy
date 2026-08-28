'use client';

export interface ChipOption {
  key: string;
  label: string;
}

/**
 * Single-select suggestion chips, used for goal and occupation (§2.1). The
 * options come from packages/shared, so this component never hardcodes a list.
 */
export function Chips({
  options,
  selected,
  onSelect,
  label,
}: {
  options: readonly ChipOption[];
  selected: string | null;
  onSelect: (key: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(option.key)}
            className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
              active
                ? 'border-brand bg-brand font-semibold text-brand-fg'
                : 'border-surface-border bg-surface text-ink hover:border-brand'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
