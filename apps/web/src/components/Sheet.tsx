'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A bottom sheet — the web stand-in for React Native's `<Modal transparent>`.
 *
 * `Modal` gets several things for free that have to be built here: it traps the
 * hardware back button (`onRequestClose`), it stops the screen behind it from
 * scrolling, and it takes focus. So this handles Escape, locks body scroll while
 * open, moves focus into the panel on open and restores it on close, and marks
 * itself `aria-modal` so assistive tech treats the page behind as inert.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Without this the page behind scrolls under the sheet on a trackpad.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      // A click that starts and ends on the backdrop closes; one that started
      // inside the panel and drifted out does not.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-surface p-5 outline-none"
      >
        {children}
      </div>
    </div>
  );
}
