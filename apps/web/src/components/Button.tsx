'use client';

import type { ButtonHTMLAttributes } from 'react';

import { BUTTON_BASE, BUTTON_VARIANT, type ButtonVariant } from './buttonStyles';
import { Spinner } from './Spinner';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  label: string;
  variant?: ButtonVariant;
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
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${
        isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : label}
    </button>
  );
}
