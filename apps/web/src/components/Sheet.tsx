'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal panel — the web stand-in for React Native's `<Modal transparent>`.
 *
 * `Modal` gets several things for free that have to be built here: it traps the
 * hardware back button (`onRequestClose`), it stops the screen behind it from
 * scrolling, and it takes focus. So this handles Escape, locks body scroll while
 * open, moves focus into the panel on open and restores it on close, and marks
 * itself `aria-modal` so assistive tech treats the page behind as inert.
 *
 * Two placements, and which one is right follows from what the panel is for.
 * `bottom` is the default and suits a panel that belongs to the thing you just
 * tapped — a form, a confirmation, one post's replies: it rises from the
 * content, sized to what it holds. `side` suits a panel that belongs to the app
 * rather than to the screen behind it, and that you scan rather than fill in.
 * It is full height, so a list arrives already at the top instead of pushed
 * down by however much of the screen the sheet decided to leave uncovered.
 */
export function Sheet({
  open,
  onClose,
  title,
  placement = 'bottom',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  placement?: 'bottom' | 'side';
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

  const side = placement === 'side';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      // A click that starts and ends on the backdrop closes; one that started
      // inside the panel and drifted out does not.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/*
        The app is a phone-width column even on a wide screen, so the panel is
        anchored to the column and not to the viewport. Without this a side
        panel opens against the right edge of a 27-inch monitor, several hundred
        pixels from the bell that opened it.
      */}
      <div
        className={`mx-auto flex h-full w-full max-w-md ${side ? 'justify-end' : 'items-end justify-center'}`}
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
          className={`flex flex-col gap-3 overflow-y-auto bg-surface p-5 outline-none ${
            side
              ? 'h-full w-[86%] max-w-sm sheet-slide-in rounded-l-xl shadow-2xl'
              : 'max-h-[90dvh] w-full rounded-t-xl'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
