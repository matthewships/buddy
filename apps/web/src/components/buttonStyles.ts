/**
 * The button look, in one place.
 *
 * This is a plain module rather than part of Button.tsx because both a client
 * component and a *server* component need it. Button.tsx is `'use client'`, and
 * a server component cannot import a value from a client module and use it
 * while rendering — it only receives a client reference. So the shared strings
 * live here, with no `'use client'`, and both sides import them.
 *
 * The alternative was WelcomeScreen keeping its own copy of the class strings
 * with a "keep these in step" comment, which is exactly the kind of note that
 * stops being true.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Shape, size and typography — everything a variant does not decide. */
export const BUTTON_BASE =
  'flex h-12 items-center justify-center rounded-md px-5 text-base font-semibold transition-colors';

/**
 * The mobile variants, plus `hover:` states — a pointer exists here and a
 * button that does not respond to one reads as broken on the web.
 *
 * `primary` is lime with ink on it rather than `brand` with white on it. The
 * seed's lime (§5.8) is the one colour on the page that reads as *go*, and it
 * only works with dark text — white on it is 1.8:1. `brand` stays the colour of
 * links and active states, where it is text and has to clear 4.5:1 itself.
 */
export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/85 active:opacity-80',
  secondary: 'bg-brand-muted text-brand hover:bg-brand-muted/70 active:opacity-80',
  ghost: 'border border-surface-border text-ink hover:bg-surface active:opacity-60',
  danger: 'bg-danger text-white hover:bg-danger/90 active:opacity-80',
};

/**
 * A link styled as a full-width, always-enabled button.
 *
 * Used where the action is a navigation rather than a handler, so it can be an
 * `<a>` that works before any JavaScript has run. `w-full` is safe to bake in
 * here — unlike in Button, nothing overrides it — but note the ordering trap it
 * comes from: Tailwind resolves competing utilities by their order in the
 * stylesheet, not in the attribute, so a caller-supplied `w-auto` would lose to
 * a hardcoded `w-full`. See Button's `className` prop.
 */
export function linkButtonClass(variant: ButtonVariant): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} w-full cursor-pointer`;
}
