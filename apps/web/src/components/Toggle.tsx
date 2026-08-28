'use client';

/**
 * The web stand-in for React Native's `<Switch>`.
 *
 * A real `<button role="switch">` rather than a styled checkbox, so it is
 * keyboard-operable and announced with its on/off state.
 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-brand' : 'bg-surface-border'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[1.375rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
