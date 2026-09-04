import { eq, inArray } from 'drizzle-orm';

import { QUIET_PUSH_TYPES, inQuietHours } from '@buddy/shared';

import type { Db } from '../db/client.js';
import { devices, users, webPushSubscriptions } from '../db/schema.js';
import type { Env } from '../env.js';
import { localHour } from '../lib/time.js';
import { sendWebPush, type VapidKeys } from './web-push.js';

/**
 * Push notifications (§4.6).
 *
 * Routes never talk to a push service directly — they enqueue, and the queue
 * consumer delivers. That keeps a slow or failing push service off the request
 * path (a buddy request must not take 2 seconds because Expo is having a bad
 * day) and gives retries for free.
 *
 * The payload carries user ids rather than device tokens: tokens can change
 * between enqueue and delivery, so they are resolved at send time. That is also
 * what lets one enqueued message reach a person on **both** transports — Expo
 * for the app, Web Push for the browser — without the caller knowing or caring
 * which devices they have. Every notification the mobile app receives therefore
 * reaches the web client too, by construction rather than by being listed
 * twice.
 */
export interface PushMessage {
  userIds: string[];
  title: string;
  body: string;
  /** Deep-link target and any ids the app needs to route the tap (§5.1). */
  data?: Record<string, string>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * How long a push service may hold an undelivered message.
 *
 * Five minutes because that is a buddy request's whole life; a notification
 * that arrives after it has expired is noise. The other nine notification types
 * would tolerate longer, and share this only because both transports have
 * always used one value — worth revisiting, not worth diverging the two clients
 * over.
 */
const PUSH_TTL_SECONDS = 300;

/** Fire-and-forget enqueue. A failed push must never fail the request that caused it. */
export async function enqueuePush(env: Env, message: PushMessage): Promise<void> {
  if (!env.PUSH_QUEUE) return;
  if (message.userIds.length === 0) return;
  try {
    await env.PUSH_QUEUE.send(message);
  } catch (error) {
    console.error('[push:enqueue-failed]', error);
  }
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Delivers one batch. Expo accepts up to 100 notifications per call.
 *
 * Tokens Expo reports as `DeviceNotRegistered` are deleted: the app was
 * uninstalled, and keeping them means paying to push into the void forever.
 */
export async function deliverPush(
  env: Env,
  db: Db,
  inbound: PushMessage[],
): Promise<{ sent: number; removed: number; webSent: number; webRemoved: number }> {
  const messages = await dropQuietRecipients(db, inbound);
  const userIds = [...new Set(messages.flatMap((m) => m.userIds))];
  if (userIds.length === 0) return { sent: 0, removed: 0, webSent: 0, webRemoved: 0 };

  const expo = await deliverExpo(env, db, messages, userIds);
  // Deliberately after Expo, which is the half that throws to retry the batch:
  // a browser notification sent before that throw would be sent again on the
  // retry, and Web Push has no de-duplication of its own.
  const web = await deliverWeb(env, db, messages, userIds);

  return { ...expo, webSent: web.sent, webRemoved: web.removed };
}

/**
 * Quiet hours (PRODUCT.md §5.3), applied at delivery rather than at enqueue.
 *
 * Only the nudge-shaped types are silenced — `QUIET_PUSH_TYPES` — because a
 * buddy request or a chat message is a person reaching out, and quiet hours
 * are about the product not doing so. Applied here, in the one place every
 * push passes through, so that no route has to remember; and against each
 * recipient's *own* local hour, because a group spans timezones and a nudge
 * that is fine in London is 3am in Tokyo. A recipient inside their window is
 * simply dropped: a nudge delivered late is a nudge about nothing.
 */
export async function dropQuietRecipients(db: Db, messages: PushMessage[]): Promise<PushMessage[]> {
  const quietMessages = messages.filter((m) => m.data?.type && QUIET_PUSH_TYPES.has(m.data.type));
  if (quietMessages.length === 0) return messages;

  const ids = [...new Set(quietMessages.flatMap((m) => m.userIds))];
  if (ids.length === 0) return messages;

  const rows = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      start: users.quietHoursStart,
      end: users.quietHoursEnd,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const now = new Date();
  const quiet = new Set<string>();
  for (const row of rows) {
    let hour: number;
    try {
      hour = localHour(row.timezone, now);
    } catch {
      continue;
    }
    if (inQuietHours(hour, row.start, row.end)) quiet.add(row.id);
  }
  if (quiet.size === 0) return messages;

  return messages.map((m) =>
    m.data?.type && QUIET_PUSH_TYPES.has(m.data.type)
      ? { ...m, userIds: m.userIds.filter((id) => !quiet.has(id)) }
      : m,
  );
}

async function deliverExpo(
  env: Env,
  db: Db,
  messages: PushMessage[],
  userIds: string[],
): Promise<{ sent: number; removed: number }> {
  const rows = await db.query.devices.findMany({
    where: inArray(devices.userId, userIds),
  });

  const tokensByUser = new Map<string, string[]>();
  for (const row of rows) {
    tokensByUser.set(row.userId, [...(tokensByUser.get(row.userId) ?? []), row.expoPushToken]);
  }

  const notifications = messages.flatMap((message) =>
    message.userIds.flatMap((userId) =>
      (tokensByUser.get(userId) ?? []).map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default' as const,
        ttl: PUSH_TTL_SECONDS,
        priority: 'high' as const,
      })),
    ),
  );

  if (notifications.length === 0) return { sent: 0, removed: 0 };

  const deadTokens: string[] = [];
  let sent = 0;

  for (let i = 0; i < notifications.length; i += 100) {
    const chunk = notifications.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN
          ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      // Throwing hands the batch back to the queue, which retries it.
      throw new Error(`Expo push failed: ${response.status} ${await response.text()}`);
    }

    const body = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = body.data ?? [];

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        sent += 1;
        return;
      }
      if (ticket.details?.error === 'DeviceNotRegistered') {
        const token = chunk[index]?.to;
        if (token) deadTokens.push(token);
      } else {
        console.error('[push:ticket-error]', ticket.message, ticket.details);
      }
    });
  }

  if (deadTokens.length > 0) {
    await db.delete(devices).where(inArray(devices.expoPushToken, deadTokens));
  }

  return { sent, removed: deadTokens.length };
}

/**
 * The VAPID identity, or null when it has not been configured.
 *
 * Returning null rather than throwing is what lets the API be deployed before
 * the keys exist: browsers simply receive nothing, exactly as they did before
 * Web Push was implemented, while every other transport carries on.
 */
export function vapidKeysFrom(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? `mailto:${env.EMAIL_FROM}`,
  };
}

/**
 * Web Push delivery, one request per subscription.
 *
 * Unlike Expo — one call for a hundred notifications — Web Push has no batch
 * endpoint: each subscription is a different push service with its own
 * encryption keys, so there is nothing to batch. Failures are contained per
 * subscription and never thrown, because throwing here would retry the whole
 * queue batch and re-send everyone else's notifications on both transports.
 */
async function deliverWeb(
  env: Env,
  db: Db,
  messages: PushMessage[],
  userIds: string[],
): Promise<{ sent: number; removed: number }> {
  const keys = vapidKeysFrom(env);
  if (!keys) return { sent: 0, removed: 0 };

  const rows = await db.query.webPushSubscriptions.findMany({
    where: inArray(webPushSubscriptions.userId, userIds),
  });
  if (rows.length === 0) return { sent: 0, removed: 0 };

  const byUser = new Map<string, typeof rows>();
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }

  const deliveries = messages.flatMap((message) =>
    message.userIds.flatMap((userId) =>
      (byUser.get(userId) ?? []).map((subscription) => ({ subscription, message })),
    ),
  );

  const dead: string[] = [];
  let sent = 0;

  // Sequential rather than Promise.all: a queue batch can hold 100 messages
  // fanned out across a group, and a hundred simultaneous subtle.encrypt +
  // fetch pairs is a good way to meet the runtime's concurrent-connection cap.
  for (const { subscription, message } of deliveries) {
    try {
      const result = await sendWebPush(
        subscription,
        // The service worker reads exactly this shape; `data` carries the same
        // routing payload the Expo notification carries, so both clients route
        // a tap from the same source of truth.
        JSON.stringify({
          title: message.title,
          body: message.body,
          data: message.data ?? {},
        }),
        keys,
        { ttlSeconds: PUSH_TTL_SECONDS, urgency: 'high' },
      );

      if (result.gone) dead.push(subscription.endpoint);
      else if (result.status >= 200 && result.status < 300) sent += 1;
    } catch (error) {
      // A transport failure for one browser. Logged, not thrown: the rest of
      // the batch has nothing to do with it.
      console.error('[web-push:failed]', error);
    }
  }

  if (dead.length > 0) {
    // The browser's equivalent of `DeviceNotRegistered`: the subscription was
    // revoked or the push service dropped it, and it will never work again.
    await db
      .delete(webPushSubscriptions)
      .where(inArray(webPushSubscriptions.endpoint, dead));
  }

  return { sent, removed: dead.length };
}

/** Removes a single device row, used when a token is rejected outright. */
export async function removeDevice(db: Db, token: string): Promise<void> {
  await db.delete(devices).where(eq(devices.expoPushToken, token));
}
