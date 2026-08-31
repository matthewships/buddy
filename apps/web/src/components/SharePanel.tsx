'use client';

import { useState } from 'react';

import { Button } from './Button';

/**
 * Sending a join link to someone who is not on Buddy yet (§2.3).
 *
 * The share sheet first, where the browser has one: `navigator.share()` is the
 * only route to WhatsApp, Telegram, Messages and everything else *the person
 * actually uses*, and it works without this app knowing which apps those are.
 * It is absent on desktop Firefox and non-secure contexts, so the direct links
 * below are not a fallback for one browser — they are the normal path for
 * roughly half of desktop users.
 *
 * Nothing here can tell whether the invite was sent. The share sheet resolves
 * when it closes, not when a message goes out, so the copy never claims it was
 * delivered.
 */
export function SharePanel({ url, groupName }: { url: string; groupName: string }) {
  const [copied, setCopied] = useState(false);

  const message = `Join "${groupName}" on Buddy — we keep each other honest about getting things done.`;
  const full = `${message} ${url}`;

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Join ${groupName}`, text: message, url });
        return;
      } catch {
        // Cancelling the sheet throws. That is not an error worth showing —
        // the links below are still right there.
      }
    }
    await copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright; the input below is selectable
      // either way, so there is always a manual route.
    }
  };

  const targets = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(full)}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}` },
    { label: 'Messages', href: `sms:?&body=${encodeURIComponent(full)}` },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(`Join ${groupName} on Buddy`)}&body=${encodeURIComponent(full)}` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Button label="Share invite" onClick={() => void share()} />

      <div className="flex flex-row flex-wrap gap-2">
        {targets.map((target) => (
          <a
            key={target.label}
            href={target.href}
            target="_blank"
            rel="noreferrer noopener"
            className="cursor-pointer rounded-full border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-brand"
          >
            {target.label}
          </a>
        ))}
      </div>

      <div className="flex flex-row items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Invite link"
          className="flex-1 rounded-xl border border-surface-border bg-surface-muted px-3 py-2 font-mono text-xs text-ink-muted"
        />
        <Button label={copied ? 'Copied' : 'Copy'} variant="ghost" onClick={() => void copy()} />
      </div>

      <p className="text-xs text-ink-subtle">
        Anyone with this link can join. It lasts a week, and you can withdraw it from the group.
      </p>
    </div>
  );
}
