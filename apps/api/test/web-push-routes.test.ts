import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/client.js';
import { deliverPush, vapidKeysFrom } from '../src/services/push.js';

import { del, get, post, resetRateLimits, signUp } from './helpers.js';

beforeEach(resetRateLimits);

/** The RFC 8291 example subscription, reused so the keys are real P-256 values. */
const KEYS = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};

/** The pair vitest.config.ts binds for the test Worker. */
const VAPID = {
  VAPID_PUBLIC_KEY:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
};

/** An env with the keys explicitly removed, rather than one that happens to lack them. */
const WITHOUT_VAPID = { ...env, VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined };

function subscription(endpoint: string) {
  return { endpoint, keys: KEYS };
}

async function rowsFor(userId: string) {
  return db(env.DB).query.webPushSubscriptions.findMany({
    where: (row, { eq }) => eq(row.userId, userId),
  });
}

describe('web push subscriptions', () => {
  it('hands the browser the key it must subscribe against', async () => {
    const user = await signUp('vapid-key@example.com');
    const res = await get('/api/me/web-push/key', user.accessToken);

    expect(res.status).toBe(200);
    // Served rather than compiled into the web bundle: a subscription is bound
    // to the key that created it, so the two must not be able to drift.
    expect(await res.json()).toEqual({ publicKey: VAPID.VAPID_PUBLIC_KEY });
  });

  it('reports the key as unavailable when the server has none', () => {
    // Not an error: a client that learns the feature is off can say so, which
    // is what makes deploying the API before the secrets exist safe.
    expect(vapidKeysFrom(WITHOUT_VAPID)).toBeNull();
  });

  it('stores a subscription and is idempotent when the client re-posts it', async () => {
    const user = await signUp('sub-store@example.com');
    const body = subscription('https://push.example.net/sub/store-1');

    expect((await post('/api/me/web-push', body, user.accessToken)).status).toBe(200);
    // The client posts whatever getSubscription() returns on every load, so
    // this happens constantly and must not accumulate rows.
    expect((await post('/api/me/web-push', body, user.accessToken)).status).toBe(200);

    const rows = await rowsFor(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.p256dh).toBe(KEYS.p256dh);
  });

  it('moves an endpoint to whoever last subscribed with it', async () => {
    const first = await signUp('sub-shared-1@example.com');
    const second = await signUp('sub-shared-2@example.com');
    const endpoint = 'https://push.example.net/sub/shared-browser';

    await post('/api/me/web-push', subscription(endpoint), first.accessToken);
    await post('/api/me/web-push', subscription(endpoint), second.accessToken);

    // One browser, one endpoint: a shared computer must not leave the previous
    // account receiving the new one's notifications.
    expect(await rowsFor(first.userId)).toHaveLength(0);
    expect(await rowsFor(second.userId)).toHaveLength(1);
  });

  it('rejects an endpoint that is not a URL', async () => {
    const user = await signUp('sub-invalid@example.com');
    const res = await post(
      '/api/me/web-push',
      { endpoint: 'not-a-url', keys: KEYS },
      user.accessToken,
    );

    expect(res.status).toBe(400);
  });

  it('unsubscribes only the caller’s own endpoint', async () => {
    const owner = await signUp('unsub-owner@example.com');
    const stranger = await signUp('unsub-stranger@example.com');
    const endpoint = 'https://push.example.net/sub/unsub-1';

    await post('/api/me/web-push', subscription(endpoint), owner.accessToken);

    // An endpoint is not a secret; guessing one must not silence its owner.
    expect((await del('/api/me/web-push', stranger.accessToken, { endpoint })).status).toBe(200);
    expect(await rowsFor(owner.userId)).toHaveLength(1);

    expect((await del('/api/me/web-push', owner.accessToken, { endpoint })).status).toBe(200);
    expect(await rowsFor(owner.userId)).toHaveLength(0);
  });

  it('drops subscriptions when the account is deleted', async () => {
    const user = await signUp('sub-deleted@example.com');
    await post(
      '/api/me/web-push',
      subscription('https://push.example.net/sub/deleted-1'),
      user.accessToken,
    );

    const res = await del('/api/me', user.accessToken);
    expect(res.status).toBe(200);

    // Account deletion is a soft delete, so the FK cascade never fires and this
    // only passes because me.ts deletes the rows explicitly.
    expect(await rowsFor(user.userId)).toHaveLength(0);
  });
});

describe('web push delivery', () => {
  it('sends nothing to browsers when the VAPID keys are unset', async () => {
    const user = await signUp('deliver-nokeys@example.com');
    await post(
      '/api/me/web-push',
      subscription('https://push.example.net/sub/nokeys'),
      user.accessToken,
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await deliverPush(WITHOUT_VAPID, db(env.DB), [
      { userIds: [user.userId], title: 'Ignored', body: 'No keys configured' },
    ]);
    fetchSpy.mockRestore();

    expect(result.webSent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('encrypts one request per subscription and carries the routing payload', async () => {
    const user = await signUp('deliver-send@example.com');
    const endpoint = 'https://push.example.net/sub/send-1';
    await post('/api/me/web-push', subscription(endpoint), user.accessToken);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 201 }));

    const result = await deliverPush({ ...env, ...VAPID }, db(env.DB), [
      {
        userIds: [user.userId],
        title: 'A task is ready to review',
        body: 'Write the thesis intro',
        data: { type: 'task_done', taskId: 't1', url: '/(tabs)/today' },
      },
    ]);

    expect(result.webSent).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(endpoint);
    const headers = new Headers(init?.headers);
    expect(headers.get('content-encoding')).toBe('aes128gcm');
    expect(headers.get('ttl')).toBe('300');
    expect(headers.get('authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=BP4z/);
    // Encrypted, so the body is opaque bytes rather than the JSON payload.
    expect(init?.body).toBeInstanceOf(Uint8Array);

    fetchSpy.mockRestore();
  });

  it('prunes a subscription the push service says is gone', async () => {
    const user = await signUp('deliver-gone@example.com');
    await post(
      '/api/me/web-push',
      subscription('https://push.example.net/sub/gone-1'),
      user.accessToken,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('gone', { status: 410 }));

    const result = await deliverPush({ ...env, ...VAPID }, db(env.DB), [
      { userIds: [user.userId], title: 'Unreachable', body: 'Subscription revoked' },
    ]);
    fetchSpy.mockRestore();

    expect(result.webRemoved).toBe(1);
    // The browser's DeviceNotRegistered: keeping it means retrying forever.
    expect(await rowsFor(user.userId)).toHaveLength(0);
  });

  it('keeps a failing browser from failing the rest of the batch', async () => {
    const user = await signUp('deliver-failure@example.com');
    await post(
      '/api/me/web-push',
      subscription('https://push.example.net/sub/failure-1'),
      user.accessToken,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('push service unreachable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Must resolve, not reject: throwing here would retry the whole queue batch
    // and re-send every other notification in it, on both transports.
    const result = await deliverPush({ ...env, ...VAPID }, db(env.DB), [
      { userIds: [user.userId], title: 'Nobody home', body: 'Transport failure' },
    ]);

    fetchSpy.mockRestore();
    errorSpy.mockRestore();

    expect(result.webSent).toBe(0);
    expect(result.webRemoved).toBe(0);
    expect(await rowsFor(user.userId)).toHaveLength(1);
  });

  it('leaves the subscriptions of everyone else in the batch alone', async () => {
    const gone = await signUp('batch-gone@example.com');
    const live = await signUp('batch-live@example.com');
    await post(
      '/api/me/web-push',
      subscription('https://push.example.net/sub/batch-gone'),
      gone.accessToken,
    );
    await post(
      '/api/me/web-push',
      subscription('https://push.example.net/sub/batch-live'),
      live.accessToken,
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const target = typeof input === 'string' ? input : (input as Request).url;
      return new Response(null, { status: target.endsWith('batch-gone') ? 404 : 201 });
    });

    const result = await deliverPush({ ...env, ...VAPID }, db(env.DB), [
      { userIds: [gone.userId, live.userId], title: 'Group notice', body: 'Both of you' },
    ]);
    fetchSpy.mockRestore();

    expect(result.webSent).toBe(1);
    expect(result.webRemoved).toBe(1);
    expect(await rowsFor(live.userId)).toHaveLength(1);
  });
});
