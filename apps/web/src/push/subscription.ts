'use client';

import { api, unwrap } from '@/api/client';

/**
 * Web Push subscriptions in the browser (§4.6).
 *
 * The counterpart of apps/mobile/src/push/register.ts: where the Expo app hands
 * the OS a token and posts it to `/me/devices`, this registers a service worker,
 * asks the browser's push service for a subscription against the server's VAPID
 * key, and posts that to `/me/web-push`. From there both clients receive the
 * same ten notification types from the same queue.
 *
 * Everything here fails soft. A browser without push, a permission that was
 * denied, a push service that is down — none of them are errors the user needs
 * to see, because the app works without notifications and the in-app
 * `RequestBanner` still appears. What they must not do is throw into a render.
 */

const SW_URL = '/sw.js';

/**
 * Whether a live subscription exists, as far as this tab knows.
 *
 * `null` means "not determined yet", which the poll-based fallback treats as
 * "do not fire": both paths raising a banner for the same buddy request is
 * worse than a few seconds of neither, and the answer arrives on mount.
 */
let active: boolean | null = null;

/** Read at notification time, so the fallback stands down as soon as push works. */
export function pushSubscriptionActive(): boolean | null {
  return active;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof window.Notification === 'function'
  );
}

/**
 * `applicationServerKey` takes the raw 65 bytes. Some browsers accept the
 * base64url string, not all do, so it is decoded here rather than relied on.
 */
function decodeVapidKey(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    // `register` resolves as soon as the registration exists, which is not the
    // same as the worker being able to receive a push — `ready` is.
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('[push] service worker registration failed', error);
    return null;
  }
}

async function serverVapidKey(): Promise<string | null> {
  try {
    const { publicKey } = await unwrap<{ publicKey: string | null }>(
      await api.api.me['web-push'].key.$get(),
    );
    return publicKey;
  } catch {
    return null;
  }
}

/**
 * Subscribes this browser and registers it with the API.
 *
 * Must be called from a user gesture the first time, because it can trigger the
 * permission prompt. Returns whether the browser is now subscribed.
 */
export async function subscribeToPush(): Promise<boolean> {
  const ready = await registration();
  if (!ready) {
    active = false;
    return false;
  }

  const publicKey = await serverVapidKey();
  if (!publicKey) {
    // The API has no VAPID keys configured. Nothing the user can fix.
    active = false;
    return false;
  }

  try {
    const existing = await ready.pushManager.getSubscription();

    // A subscription made against a different (rotated) VAPID key can never be
    // pushed to, and `subscribe` would reject rather than replace it.
    if (existing && !subscribedWith(existing, publicKey)) {
      await existing.unsubscribe();
    }

    const subscription =
      (await ready.pushManager.getSubscription()) ??
      (await ready.pushManager.subscribe({
        // Required by every browser that implements push: a payload that shows
        // no notification is a silent-tracking vector, and repeated offences
        // cost the site its permission.
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey) as BufferSource,
      }));

    await postSubscription(subscription);
    active = true;
    return true;
  } catch (error) {
    console.warn('[push] subscribe failed', error);
    active = false;
    return false;
  }
}

/**
 * Re-registers whatever subscription this browser already has.
 *
 * This is the `pushsubscriptionchange` story. A service worker cannot handle
 * that event usefully here — it would have to call the API, and the session
 * token lives in `localStorage`, which a worker cannot read — so the page
 * re-posts the current subscription on every load instead. The endpoint upserts
 * on the endpoint, so this is cheap and idempotent, and a subscription the
 * browser silently rotated is picked up on the next visit.
 */
export async function syncSubscription(): Promise<boolean> {
  if (!pushSupported() || window.Notification.permission !== 'granted') {
    active = false;
    return false;
  }

  const ready = await registration();
  if (!ready) {
    active = false;
    return false;
  }

  try {
    const subscription = await ready.pushManager.getSubscription();
    if (!subscription) {
      active = false;
      return false;
    }

    await postSubscription(subscription);
    active = true;
    return true;
  } catch (error) {
    console.warn('[push] subscription sync failed', error);
    active = false;
    return false;
  }
}

/** Ends push for this browser, on the server first so nothing is pushed into the void. */
export async function unsubscribeFromPush(): Promise<void> {
  active = false;
  if (!pushSupported()) return;

  try {
    const ready = await navigator.serviceWorker.ready;
    const subscription = await ready.pushManager.getSubscription();
    if (!subscription) return;

    // Deleted server-side before the browser forgets the endpoint: the other
    // order can leave a row that nothing will ever be able to remove.
    await api.api.me['web-push'].$delete({ json: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  } catch (error) {
    console.warn('[push] unsubscribe failed', error);
  }
}

function subscribedWith(subscription: PushSubscription, publicKey: string): boolean {
  const applied = subscription.options?.applicationServerKey;
  if (!applied) return false;
  const current = decodeVapidKey(publicKey);
  const bytes = new Uint8Array(applied);
  return bytes.length === current.length && bytes.every((byte, i) => byte === current[i]);
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error('Subscription is missing its keys');

  await unwrap(
    await api.api.me['web-push'].$post({
      json: { endpoint: subscription.endpoint, keys: { p256dh, auth } },
    }),
  );
}
