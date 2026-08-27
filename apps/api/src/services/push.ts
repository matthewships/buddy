import { eq, inArray } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { devices } from '../db/schema.js';
import type { Env } from '../env.js';

/**
 * Push notifications (§4.6).
 *
 * Routes never talk to Expo directly — they enqueue, and the queue consumer
 * delivers. That keeps a slow or failing push service off the request path (a
 * buddy request must not take 2 seconds because Expo is having a bad day) and
 * gives retries for free.
 *
 * The payload carries user ids rather than device tokens: tokens can change
 * between enqueue and delivery, so they are resolved at send time.
 */
export interface PushMessage {
  userIds: string[];
  title: string;
  body: string;
  /** Deep-link target and any ids the app needs to route the tap (§5.1). */
  data?: Record<string, string>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
  messages: PushMessage[],
): Promise<{ sent: number; removed: number }> {
  const userIds = [...new Set(messages.flatMap((m) => m.userIds))];
  if (userIds.length === 0) return { sent: 0, removed: 0 };

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
        // Buddy requests expire in 5 minutes; a late notification is noise.
        ttl: 300,
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

/** Removes a single device row, used when a token is rejected outright. */
export async function removeDevice(db: Db, token: string): Promise<void> {
  await db.delete(devices).where(eq(devices.expoPushToken, token));
}
