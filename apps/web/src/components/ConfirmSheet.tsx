'use client';

import { Button } from './Button';
import { Sheet } from './Sheet';

/**
 * The stand-in for `Alert.alert` with a destructive option.
 *
 * `window.confirm` would have been shorter, but it is styled by the browser,
 * cannot mark which choice is destructive, and is suppressible — a bad fit for
 * account deletion, which is the only thing this is used for. Reusing Sheet
 * keeps the focus handling and Escape behaviour in one place.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <p className="text-base text-ink-muted">{body}</p>
      <Button label={confirmLabel} variant="danger" loading={busy} onClick={onConfirm} />
      <Button label={cancelLabel} variant="ghost" disabled={busy} onClick={onCancel} />
    </Sheet>
  );
}
