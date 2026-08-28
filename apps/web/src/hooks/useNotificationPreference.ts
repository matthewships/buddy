'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The opt-in state behind browser notifications for incoming buddy requests.
 *
 * Two facts are tracked, and they are deliberately not the same thing:
 *
 * - **The browser permission**, which only the browser can change, and which
 *   cannot be re-prompted once the user has denied it.
 * - **The user's wish**, stored here. Someone who granted the permission months
 *   ago and has since turned the feature off in Profile must stay off, and a
 *   permission revoked in browser settings must not silently erase the wish —
 *   so the two are stored and reported separately.
 */
const PREF_KEY = 'buddy.notifications.requests';

/**
 * Permission as this app cares about it. `unknown` is the pre-mount value: no
 * route may touch `window` during prerender, so the real state is unreadable
 * until an effect runs.
 */
export type NotificationState = 'unknown' | 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * `window.Notification` is absent both during the Worker prerender and in
 * browsers without the API. Callers treat the two identically: do nothing.
 */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

/** The live permission, never cached — the user can change it in browser settings at any time. */
export function currentNotificationState(): NotificationState {
  if (!notificationsSupported()) return 'unsupported';
  const permission = window.Notification.permission;
  return permission === 'granted' || permission === 'denied' ? permission : 'default';
}

export function readPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PREF_KEY) === 'on';
  } catch {
    // Safari in private mode throws on `localStorage` access. Treated as opted
    // out, which is the safe default for something that raises banners.
    return false;
  }
}

export function writePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // The preference just does not survive the reload.
  }
}

/**
 * The single gate every notification passes through.
 *
 * Read at the moment of firing rather than captured in state, so a preference
 * toggled on the Profile screen — or a permission revoked in browser settings —
 * takes effect immediately, with no cross-component state to keep in sync.
 */
export function notificationsArmed(): boolean {
  return currentNotificationState() === 'granted' && readPreference();
}

export interface NotificationPreference {
  /** `unknown` until the first effect has run; render nothing meaningful until then. */
  state: NotificationState;
  /** The user's wish, independent of the permission. */
  enabled: boolean;
  /** True while a permission prompt is open. */
  busy: boolean;
  /** Must be called from a real click — see below. */
  enable: () => Promise<void>;
  setEnabled: (value: boolean) => void;
}

export function useNotificationPreference(): NotificationPreference {
  const [state, setState] = useState<NotificationState>('unknown');
  const [enabled, setEnabledState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const read = () => {
      setState(currentNotificationState());
      setEnabledState(readPreference());
    };
    read();

    // A permission can be revoked in browser settings while this tab sits in
    // the background, so re-read on return rather than showing "notifications
    // are on" against a permission that no longer exists.
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const enable = useCallback(async () => {
    if (!notificationsSupported()) {
      setState('unsupported');
      return;
    }

    setBusy(true);
    try {
      // Browsers require a user gesture for this call, and prompting on load is
      // actively penalised, which is why this only ever runs from a button.
      await window.Notification.requestPermission();
    } catch {
      // Older Safari only implements the callback form and rejects the promise.
      // The permission may still have been set, so fall through and re-read it.
    } finally {
      setBusy(false);
    }

    // Trust the live value, not the resolved one: the callback-style
    // implementations resolve `undefined`.
    const next = currentNotificationState();
    setState(next);
    if (next === 'granted') {
      writePreference(true);
      setEnabledState(true);
    }
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    writePreference(value);
    setEnabledState(value);
  }, []);

  return { state, enabled, busy, enable, setEnabled };
}
