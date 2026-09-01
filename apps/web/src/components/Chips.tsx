'use client';

export interface ChipOption {
  key: string;
  label: string;
}

interface SingleChipsProps {
  options: readonly ChipOption[];
  label: string;
  /** Single-select: one key or none. */
  selected: string | null;
  onSelect: (key: string) => void;
  max?: never;
  onChange?: never;
}

interface MultiChipsProps {
  options: readonly ChipOption[];
  label: string;
  /** Multi-select: the chosen keys, in the order they were picked. */
  selected: readonly string[];
  /**
   * How many may be picked at once. Chips beyond the cap go disabled.
   * Omit it for an uncapped question — goals are one, since how many things
   * someone is working toward is not ours to decide.
   */
  max?: number;
  onChange: (keys: string[]) => void;
  onSelect?: never;
}

/**
 * Suggestion chips, used for goal and occupation (§2.1). The options come from
 * packages/shared, so this component never hardcodes a list.
 *
 * Single- and multi-select are one component because they are the same control
 * with a different arity. The two prop shapes are a discriminated union rather
 * than a `multiple` boolean so a caller cannot pass a `string[]` with an
 * `onSelect` that takes a `string`, which the boolean version could not
 * prevent.
 *
 * The discriminant is the handler, not `max`: an uncapped multi-select is a
 * real question (goals), and keying arity off a cap would have made "no limit"
 * unexpressible.
 */
export function Chips(props: SingleChipsProps | MultiChipsProps) {
  const { options, label } = props;
  const multi = props.onChange !== undefined;
  const chosen = multi ? (props.selected as readonly string[]) : [];
  const atCap = multi && props.max !== undefined && chosen.length >= props.max;

  const isActive = (key: string) =>
    multi ? chosen.includes(key) : key === (props.selected as string | null);

  const toggle = (key: string) => {
    if (!multi) {
      props.onSelect!(key);
      return;
    }
    // Deselecting is how you swap once the cap is reached, so removal always
    // works even when every remaining chip is disabled.
    const next = chosen.includes(key)
      ? chosen.filter((k) => k !== key)
      : props.max === undefined
        ? [...chosen, key]
        : [...chosen, key].slice(0, props.max);
    props.onChange!(next);
  };

  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-label={label}
      className="flex flex-row flex-wrap gap-2"
    >
      {options.map((option) => {
        const active = isActive(option.key);
        // At the cap, the unpicked chips are inert rather than hidden: the user
        // can still see what they passed over, and the disabled state explains
        // the limit better than a chip that silently ignores a click.
        const blocked = atCap && !active;
        return (
          <button
            key={option.key}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={active}
            disabled={blocked}
            onClick={() => toggle(option.key)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              active
                ? 'border-brand bg-brand font-semibold text-brand-fg'
                : 'border-surface-border bg-surface text-ink'
            } ${
              blocked
                ? 'cursor-not-allowed opacity-40'
                : `cursor-pointer ${active ? '' : 'hover:border-brand'}`
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
