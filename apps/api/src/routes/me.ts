import { zValidator } from '@hono/zod-validator';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  handleSchema,
  registerDeviceSchema,
  unsubscribeWebPushSchema,
  updateMeSchema,
  webPushSubscriptionSchema,
} from '@buddy/shared';

import { db } from '../db/client.js';
import {
  buddyProfiles,
  devices,
  refreshTokens,
  users,
  webPushSubscriptions,
} from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { vapidKeysFrom } from '../services/push.js';
import { publicSelf } from './auth.js';

/** Avatar keys are namespaced by user so one user cannot overwrite another's. */
function avatarKeyFor(userId: string): string {
  return `avatars/${userId}/${newId()}`;
}

export const meRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const client = db(c.env.DB);
    const userId = currentUserId(c);

    const user = await client.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw notFound('Account not found');

    const profile = await client.query.buddyProfiles.findFirst({
      where: eq(buddyProfiles.userId, userId),
    });

    return c.json({
      ...publicSelf(user),
      buddyProfile: profile
        ? {
            headline: profile.headline,
            about: profile.about,
            availability: profile.availability,
            checkinStyle: profile.checkinStyle,
          }
        : null,
    });
  })

  /**
   * Partial profile update, and the step that completes onboarding.
   *
   * `onboarded_at` is stamped the first time the user has both a goal and a
   * chosen handle, so the app never has to infer completion.
   */
  .patch('/', zValidator('json', updateMeSchema), async (c) => {
    const patch = c.req.valid('json');
    const client = db(c.env.DB);
    const userId = currentUserId(c);

    const current = await client.query.users.findFirst({ where: eq(users.id, userId) });
    if (!current) throw notFound('Account not found');

    if (patch.handle && patch.handle !== current.handle) {
      const taken = await client.query.users.findFirst({
        where: and(eq(users.handle, patch.handle), ne(users.id, userId)),
        columns: { id: true },
      });
      // Handles are public, so reporting a collision leaks nothing and the user
      // needs to know in order to pick another.
      if (taken) throw conflict('That handle is taken', { field: 'handle' });
    }

    const nextGoalKey = patch.goalKey ?? current.goalKey;
    // The schema can only compare the two halves when both are in the patch. A
    // patch carrying just goalKey2 has to be checked against what is stored,
    // otherwise the same goal could land in both columns.
    const nextGoalKey2 = patch.goalKey2 !== undefined ? patch.goalKey2 : current.goalKey2;
    if (nextGoalKey2 && nextGoalKey2 === nextGoalKey) {
      throw conflict('Pick two different goals', { field: 'goalKey2' });
    }

    const completesOnboarding =
      current.onboardedAt === null && nextGoalKey !== null && patch.handle !== undefined;

    await client
      .update(users)
      .set({
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.handle !== undefined && { handle: patch.handle }),
        ...(patch.timezone !== undefined && { timezone: patch.timezone }),
        ...(patch.avatarKey !== undefined && { avatarKey: patch.avatarKey ?? null }),
        ...(patch.isOpenBuddy !== undefined && { isOpenBuddy: patch.isOpenBuddy }),
        ...(patch.goalKey !== undefined && { goalKey: patch.goalKey }),
        ...(patch.goalKey2 !== undefined && { goalKey2: patch.goalKey2 ?? null }),
        ...(patch.goalText !== undefined && { goalText: patch.goalText ?? null }),
        ...(patch.occupationKey !== undefined && { occupationKey: patch.occupationKey }),
        ...(patch.occupationText !== undefined && {
          occupationText: patch.occupationText ?? null,
        }),
        ...(completesOnboarding && { onboardedAt: nowIso() }),
      })
      .where(eq(users.id, userId));

    if (patch.buddyProfile) {
      const fields = {
        headline: patch.buddyProfile.headline ?? null,
        about: patch.buddyProfile.about ?? null,
        availability: patch.buddyProfile.availability ?? null,
        checkinStyle: patch.buddyProfile.checkinStyle ?? null,
        updatedAt: nowIso(),
      };
      // Upsert: the buddy profile row appears the first time it is filled in.
      await client
        .insert(buddyProfiles)
        .values({ userId, ...fields })
        .onConflictDoUpdate({ target: buddyProfiles.userId, set: fields });
    }

    const updated = await client.query.users.findFirst({ where: eq(users.id, userId) });
    const profile = await client.query.buddyProfiles.findFirst({
      where: eq(buddyProfiles.userId, userId),
    });

    return c.json({
      ...publicSelf(updated!),
      buddyProfile: profile
        ? {
            headline: profile.headline,
            about: profile.about,
            availability: profile.availability,
            checkinStyle: profile.checkinStyle,
          }
        : null,
    });
  })

  /** Availability check for the onboarding handle field. */
  .get('/handle-available', zValidator('query', z.object({ handle: handleSchema })), async (c) => {
    const { handle } = c.req.valid('query');
    const userId = currentUserId(c);
    const taken = await db(c.env.DB).query.users.findFirst({
      where: and(eq(users.handle, handle), ne(users.id, userId)),
      columns: { id: true },
    });
    return c.json({ handle, available: !taken });
  })

  /**
   * Issues a short-lived upload target for an avatar (§4.4).
   *
   * The client PUTs the image to this Worker rather than to a presigned S3-style
   * URL: R2's presigning needs an access-key pair, and a binding-backed upload
   * keeps the credential out of the app entirely while still being one request.
   */
  .post('/avatar', async (c) => {
    const userId = currentUserId(c);
    const key = avatarKeyFor(userId);
    return c.json({ key, uploadUrl: `/api/me/avatar/${encodeURIComponent(key)}` });
  })

  .put('/avatar/:key{.+}', async (c) => {
    const userId = currentUserId(c);
    const key = decodeURIComponent(c.req.param('key'));

    // The key is client-supplied, so re-check ownership rather than trusting it.
    if (!key.startsWith(`avatars/${userId}/`)) {
      throw badRequest('That upload key is not yours');
    }

    const contentType = c.req.header('content-type') ?? 'application/octet-stream';
    if (!/^image\/(jpeg|png|webp|heic)$/.test(contentType)) {
      throw badRequest('Avatars must be a JPEG, PNG, WebP or HEIC image');
    }

    const body = await c.req.arrayBuffer();
    const maxBytes = 5 * 1024 * 1024;
    if (body.byteLength === 0) throw badRequest('That image is empty');
    if (body.byteLength > maxBytes) throw badRequest('Avatars must be under 5 MB');

    await c.env.STORAGE.put(key, body, { httpMetadata: { contentType } });

    const client = db(c.env.DB);
    const previous = await client.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { avatarKey: true },
    });

    await client.update(users).set({ avatarKey: key }).where(eq(users.id, userId));

    // Replacing an avatar should not leave the old object paying rent forever.
    if (previous?.avatarKey && previous.avatarKey !== key) {
      c.executionCtx.waitUntil(c.env.STORAGE.delete(previous.avatarKey));
    }

    return c.json({ avatarKey: key });
  })

  /**
   * Account deletion (§4.3) — required by both app stores.
   *
   * Soft delete, not a row DROP. The ledger, reviews and messages this person
   * took part in belong to other people's history too: hard-deleting would
   * rewrite their group's chat and silently reverse credits their buddies
   * earned by reviewing. So identifying fields are scrubbed, the account is
   * marked deleted and every session revoked, which is what the stores actually
   * require. Their rows stay linkable but anonymous.
   *
   * Devices go immediately, so no further push can reach them.
   */
  .delete('/', async (c) => {
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const user = await client.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { avatarKey: true, deletedAt: true },
    });
    if (!user) throw notFound('Account not found');
    if (user.deletedAt !== null) return c.json({ ok: true as const, alreadyDeleted: true as const });

    const stamp = nowIso();
    // The handle and email are freed for reuse but must stay unique, so they are
    // replaced with a value derived from the id rather than set to NULL.
    const tombstone = `deleted-${userId.toLowerCase()}`;

    await client.batch([
      client
        .update(users)
        .set({
          deletedAt: stamp,
          email: `${tombstone}@deleted.invalid`,
          handle: tombstone.slice(0, 24),
          displayName: 'Deleted account',
          avatarKey: null,
          goalText: null,
          occupationText: null,
          isOpenBuddy: false,
          passwordHash: 'deleted',
          passwordSalt: 'deleted',
        })
        .where(eq(users.id, userId)),
      // Remove the buddy profile outright: it is free text about a person who
      // has left, and nothing else references it.
      client.delete(buddyProfiles).where(eq(buddyProfiles.userId, userId)),
      client.delete(devices).where(eq(devices.userId, userId)),
      // Explicit, not covered by the FK cascade: deletion here is a soft
      // delete, so the `users` row never goes away and `ON DELETE cascade`
      // never fires. Without this line a deleted account keeps receiving
      // browser notifications.
      client.delete(webPushSubscriptions).where(eq(webPushSubscriptions.userId, userId)),
      client
        .update(refreshTokens)
        .set({ revokedAt: stamp })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))),
    ]);

    if (user.avatarKey) {
      c.executionCtx.waitUntil(c.env.STORAGE.delete(user.avatarKey));
    }

    return c.json({ ok: true as const, alreadyDeleted: false as const });
  })

  .post('/devices', zValidator('json', registerDeviceSchema), async (c) => {
    const { expoPushToken, platform } = c.req.valid('json');
    const userId = currentUserId(c);

    // A push token identifies an app install, not a person: if the same device
    // is used by another account, the row moves rather than duplicating.
    await db(c.env.DB)
      .insert(devices)
      .values({ id: newId(), userId, expoPushToken, platform })
      .onConflictDoUpdate({
        target: devices.expoPushToken,
        set: { userId, platform, updatedAt: nowIso() },
      });

    return c.json({ ok: true as const });
  })

  /**
   * The public half of the VAPID keypair, which the browser needs before it can
   * subscribe (§4.6).
   *
   * Served rather than compiled into the web bundle so the two cannot drift: a
   * subscription is bound to the key it was created with, and a client holding
   * a stale key would produce subscriptions this server can never push to.
   * `null` means the keys are not configured, and the client shows the feature
   * as unavailable instead of failing at `subscribe()`.
   */
  .get('/web-push/key', (c) => {
    const keys = vapidKeysFrom(c.env);
    return c.json({ publicKey: keys?.publicKey ?? null });
  })

  /**
   * Registers a browser subscription. Also the self-heal path: the client posts
   * whatever `getSubscription()` returns on every load, so a subscription the
   * browser silently rotated is re-registered without the user doing anything.
   */
  .post('/web-push', zValidator('json', webPushSubscriptionSchema), async (c) => {
    const { endpoint, keys } = c.req.valid('json');
    const userId = currentUserId(c);

    // Keyed on the endpoint for the same reason `/devices` is keyed on the
    // token: it identifies a browser, not a person, and a shared computer must
    // move the row rather than end up pushing one person's tasks to another.
    await db(c.env.DB)
      .insert(webPushSubscriptions)
      .values({ id: newId(), userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: webPushSubscriptions.endpoint,
        set: { userId, p256dh: keys.p256dh, auth: keys.auth, updatedAt: nowIso() },
      });

    return c.json({ ok: true as const });
  })

  /**
   * Turning notifications off. Scoped to this user's own rows: an endpoint is
   * not a secret, and unsubscribing someone else's browser should not be
   * possible by guessing one.
   */
  .delete('/web-push', zValidator('json', unsubscribeWebPushSchema), async (c) => {
    const { endpoint } = c.req.valid('json');
    const userId = currentUserId(c);

    await db(c.env.DB)
      .delete(webPushSubscriptions)
      .where(
        and(
          eq(webPushSubscriptions.endpoint, endpoint),
          eq(webPushSubscriptions.userId, userId),
        ),
      );

    return c.json({ ok: true as const });
  });
