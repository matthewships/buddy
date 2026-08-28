'use client';

import type { ButtonHTMLAttributes } from 'react';

import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * The mobile variants, plus `hover:` states — a pointer exists here and a
 * button that does not respond to one reads as broken on the web.
 */
const CONTAINER: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand/90 active:opacity-80',
  secondary: 'bg-brand-muted text-brand hover:bg-brand-muted/70 active:opacity-80',
  ghost: 'border border-surface-border text-ink hover:bg-surface active:opacity-60',
  danger: 'bg-danger text-white hover:bg-danger/90 active:opacity-80',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /**
   * Sizing, and anything else the caller needs to override.
   *
   * The width lives here rather than in the base classes below because Tailwind
   * resolves competing utilities by their order in the stylesheet, not by the
   * order they appear in the attribute — `w-auto` is emitted before `w-full`,
   * so a hardcoded `w-full` in the base would silently beat a `w-auto` passed
   * in by a caller. Defaulting the prop keeps full-width buttons full-width
   * while letting a row use `flex-1` or an inline button use `w-auto` and
   * actually get it.
   */
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  className = 'w-full',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      type="button"
      aria-busy={loading}
      disabled={isDisabled}
      className={`flex h-12 items-center justify-center rounded-xl px-5 text-base font-semibold transition-colors ${
        CONTAINER[variant]
      } ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : label}
    </button>
  );
}
