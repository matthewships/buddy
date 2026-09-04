'use client';

import { useId } from 'react';

export interface FieldProps {
  label: string;
  value: string;
  /**
   * Named after the mobile component's prop rather than the DOM's `onChange`,
   * and handed the string directly. The screens in this app are ports of the
   * Expo screens, and keeping the prop identical makes each one a mechanical
   * translation that stays easy to diff against its counterpart.
   */
  onChangeText: (value: string) => void;
  error?: string | null;
  hint?: string | null;
  placeholder?: string;
  /** `multiline` maps to a <textarea>, as TextInput's does to a multiline field. */
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  /** `date` renders the platform's own picker; see start/age/page.tsx. */
  type?: 'text' | 'email' | 'password' | 'date';
  inputMode?: 'text' | 'email' | 'numeric';
  autoComplete?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
}

/**
 * A labelled text input. The error is rendered as text rather than only as a red
 * border, and tied to the input with `aria-describedby` / `aria-invalid` so
 * screen readers announce it — the web equivalent of the mobile component's
 * accessibility props.
 */
export function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  placeholder,
  multiline = false,
  rows = 4,
  maxLength,
  type = 'text',
  inputMode,
  autoComplete,
  autoCapitalize,
  autoFocus,
  disabled,
  onSubmit,
}: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint ?? null;

  const shared = {
    id,
    value,
    placeholder,
    maxLength,
    autoComplete,
    autoCapitalize,
    autoFocus,
    disabled,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': message ? messageId : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChangeText(event.target.value),
    className: `w-full rounded-md border bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-subtle focus:border-brand disabled:opacity-60 ${
      error ? 'border-danger' : 'border-surface-border'
    }`,
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>

      {multiline ? (
        <textarea {...shared} rows={rows} className={`${shared.className} py-3`} />
      ) : (
        <input
          {...shared}
          type={type}
          inputMode={inputMode}
          className={`${shared.className} h-12`}
          onKeyDown={
            onSubmit
              ? (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onSubmit();
                  }
                }
              : undefined
          }
        />
      )}

      {message ? (
        <p
          id={messageId}
          aria-live={error ? 'polite' : undefined}
          className={`text-sm ${error ? 'text-danger' : 'text-ink-subtle'}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
