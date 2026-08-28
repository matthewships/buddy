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
  /** Buttons are full-width in the app; a row of them uses `flex-1` instead. */
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      type="button"
      aria-busy={loading}
      disabled={isDisabled}
      className={`flex h-12 w-full items-center justify-center rounded-xl px-5 text-base font-semibold transition-colors ${
        CONTAINER[variant]
      } ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : label}
    </button>
  );
}
