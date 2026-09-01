'use client';

import type { ReactNode } from 'react';

/**
 * A round, icon-only action for a screen's top-right corner.
 *
 * Shared rather than redeclared per screen, because the corner is now a
 * convention: the group screen opens chat, standings and settings from it, and
 * the profile screen opens notifications, editing and settings. Two copies of
 * the same 40px circle drift — one gains a hover state, the other keeps a
 * different border — and the corner stops reading as one row of controls.
 *
 * Always labelled. A glyph with no name is a guess for anyone using a screen
 * reader, and a slow guess for everyone else.
 */
export function IconButton({
  label,
  glyph,
  onClick,
}: {
  label: string;
  glyph: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-surface-border bg-surface text-ink-muted transition-colors hover:border-brand hover:text-brand"
    >
      <span className="h-5 w-5">{glyph}</span>
    </button>
  );
}
