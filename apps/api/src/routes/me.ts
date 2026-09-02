import { zValidator } from '@hono/zod-validator';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  handleSchema,
  normaliseInstitution,
  occupationForLevel,
  registerDeviceSchema,
  setStatusSchema,
  statusIsCurrent,
  unsubscribeWebPushSchema,
  updateMeSchema,
  webPushSubscriptionSchema,
} from '@buddy/shared';

import { db } from '../db/client.js';
import {
  buddyProfiles,
  devices,
  posts,
  refreshTokens,
  users,
  webPushSubscriptions,
} from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { placeholderHandle } from '../lib/handles.js';
import { newId } from '../lib/ids.js';
import { localDateOrUtc, nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import { vapidKeysFrom } from '../services/push.js';
import { readTags, replaceTags } from '../services/tags.js';
import { publicSelf } from './auth.js';

/** Media keys are namespaced by user so one user cannot overwrite another's. */
function avatarKeyFor(userId: string): string {
  return `avatars/${userId}/${newId()}`;
}

function postKeyFor(userId: string): string {
  return `posts/${userId}/${newId()}`;
}

/**
 * Proof images live under their own prefix because they are the one kind of
 * upload that is *not* world-readable to signed-in users. Avatars and Feed
 * photos are served unauthenticated from `/api/media` on the reasoning that
 * everyone can already see them; a proof is group-private, so it is served by
 * `GET /api/tasks/:id/proof-image` behind a membership check instead, and the
 * prefix is what keeps the two from being confused.
 */
function proofKeyFor(userId: string): string {
  return `proofs/${userId}/${newId()}`;
}

export const meRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const client = db(c.env.DB);
    const userId = currentUserId(c);

    const user = await client.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw notFound('Account not found');

    const [profile, tags] = await Promise.all([
      client.query.buddyProfiles.findFirst({ where: eq(buddyProfiles.userId, userId) }),
      readTags(client, userId),
    ]);

    return c.json({
      ...publicSelf(user),
      ...tags,
      /**
       * Expiry is applied here rather than left to the client, so what this
       * returns is what a groupmate would actually see. A client deciding for
       * itself would need the setter's timezone and the same day arithmetic,
       * and the two could disagree about whose midnight had passed.
       */
      statusKey: statusIsCurrent(user.statusDate, localDateOrUtc(user.timezone))
        ? user.statusKey
        : null,
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
   * Today's status (§2.6).
   *
   * Its own route rather than a field on PATCH /me, because it is not a profile
   * fact: it is set from the group screen, it is true for one day, and it is
   * written far more often than anything in the profile. The stored day comes
   * from the server using the caller's timezone — a client that sent its own
   * date could keep a status alive indefinitely by sending yesterday's.
   */
  .put('/status', zValidator('json', setStatusSchema), async (c) => {
    const client = db(c.env.DB);
    const userId = currentUserId(c);
    const { statusKey } = c.req.valid('json');

    const user = await client.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { timezone: true },
    });
    if (!user) throw notFound('Account not found');

    // Cleared together: a date with no key says nothing, and a key with no date
    // would be a status that never expires.
    const statusDate = statusKey === null ? null : localDateOrUtc(user.timezone);

    await client.update(users).set({ statusKey, statusDate }).where(eq(users.id, userId));

    return c.json({ statusKey, statusDate });
  })

  /**
   * Partial profile update, and the step that completes onboarding.
   *
   * `onboarded_at` is stamped once the account has a claimed handle, a goal,
   * and either a level of study or an occupation — see `completesOnboarding`
   * below for why that last clause is a disjunction.
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

    /**
     * Goals arrive in one of two shapes, and leave in both (§2.1).
     *
     * The web picker is uncapped and sends the whole ordered list as
     * `goalKeys`; the mobile app knows only the indexed pair and sends
     * `goalKey`/`goalKey2`. Whichever arrives, both representations are written
     * here, so `goal_key` — which matching, the directory filter and every
     * older client read — can never drift from the list.
     *
     * A pair-shaped patch rewrites the list to exactly those two, which does
     * drop any extra goals picked on the web. That is the honest reading of a
     * two-goal client saying "these are my goals": merging the dropped ones
     * back in would invent an answer the user did not give.
     */
    const goalList = patch.goalKeys;
    const nextGoalKey = goalList ? (goalList[0] ?? null) : (patch.goalKey ?? current.goalKey);
    // The schema can only compare the two halves when both are in the patch. A
    // patch carrying just goalKey2 has to be checked against what is stored,
    // otherwise the same goal could land in both columns. A list needs no such
    // check: it is deduplicated on the way in.
    const nextGoalKey2 = goalList
      ? (goalList[1] ?? null)
      : patch.goalKey2 !== undefined
        ? patch.goalKey2
        : current.goalKey2;
    if (!goalList && nextGoalKey2 && nextGoalKey2 === nextGoalKey) {
      throw conflict('Pick two different goals', { field: 'goalKey2' });
    }

    /**
     * The list as it will be stored: sent whole, or reconstructed from the pair
     * so that a mobile patch leaves the two in step.
     */
    const nextGoalKeys =
      goalList ??
      (patch.goalKey !== undefined || patch.goalKey2 !== undefined
        ? [nextGoalKey, nextGoalKey2].filter((key): key is string => key !== null)
        : undefined);

    const nextLevel =
      patch.educationLevel !== undefined ? patch.educationLevel : current.educationLevel;

    /**
     * Signup stopped asking the occupation question, but `occupation_key` is
     * indexed, CHECK-constrained and read by the mobile app, so it is derived
     * from the level of study instead. An explicit `occupationKey` in the patch
     * still wins — that is what the mobile app sends, and it should not have
     * its own answer overwritten by an inference.
     */
    const derivedOccupation =
      patch.occupationKey !== undefined
        ? patch.occupationKey
        : patch.educationLevel
          ? occupationForLevel(patch.educationLevel)
          : undefined;
    const nextOccupationKey = derivedOccupation ?? current.occupationKey;

    /**
     * Completion needs a *claimed* handle, not the arrival of one in this
     * patch: the web client claims it on the register screen, so its completing
     * patch carries no handle at all.
     *
     * Level **or** occupation, not level alone: the mobile app never sends a
     * level, and requiring one would leave every mobile user stuck in the
     * onboarding gate forever.
     */
    const nextHandle = patch.handle ?? current.handle;
    const completesOnboarding =
      current.onboardedAt === null &&
      nextGoalKey !== null &&
      nextHandle !== placeholderHandle(userId) &&
      (nextLevel !== null || nextOccupationKey !== null);

    /**
     * Collected first, and only written if it is non-empty: a patch that
     * changes nothing but tags — deselecting a topic chip, say — has no columns
     * to set, and Drizzle rejects an empty SET with "No values to set" rather
     * than treating it as a no-op.
     */
    const columns = {
      ...(patch.displayName !== undefined && { displayName: patch.displayName }),
      ...(patch.handle !== undefined && { handle: patch.handle }),
      ...(patch.timezone !== undefined && { timezone: patch.timezone }),
      ...(patch.avatarKey !== undefined && { avatarKey: patch.avatarKey ?? null }),
      ...(patch.isOpenBuddy !== undefined && { isOpenBuddy: patch.isOpenBuddy }),
      // Derived above rather than copied from the patch, so the list and the
      // indexed pair are written from one decision.
      ...(nextGoalKeys !== undefined && {
        goalKey: nextGoalKey,
        goalKey2: nextGoalKey2,
        goalKeys: nextGoalKeys,
      }),
      ...(patch.goalText !== undefined && { goalText: patch.goalText ?? null }),
      ...(patch.interestText !== undefined && { interestText: patch.interestText ?? null }),
      ...(derivedOccupation !== undefined && { occupationKey: derivedOccupation }),
      ...(patch.occupationText !== undefined && {
        occupationText: patch.occupationText ?? null,
      }),
      ...(patch.educationLevel !== undefined && { educationLevel: patch.educationLevel ?? null }),
      // The raw text is what gets displayed; the normalised form is the
      // matching key the directory compares and indexes on. Written together
      // so they can never disagree.
      ...(patch.institution !== undefined && {
        institution: patch.institution ?? null,
        institutionNormalised: patch.institution ? normaliseInstitution(patch.institution) : null,
      }),
      ...(patch.city !== undefined && { city: patch.city ?? null }),
      ...(patch.majorKey !== undefined && { majorKey: patch.majorKey ?? null }),
      ...(patch.majorText !== undefined && { majorText: patch.majorText ?? null }),
      ...(patch.country !== undefined && { country: patch.country ?? null }),
      ...(patch.bio !== undefined && { bio: patch.bio ?? null }),
      ...(completesOnboarding && { onboardedAt: nowIso() }),
    };

    if (Object.keys(columns).length > 0) {
      await client.update(users).set(columns).where(eq(users.id, userId));
    }

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

    // Sequential, not batched with the update above: D1 has no interactive
    // transaction, and a tag write that lands while the column write fails
    // would leave the two halves of one profile disagreeing.
    if (patch.topics !== undefined) await replaceTags(client, userId, 'topic', patch.topics);
    if (patch.interests !== undefined) {
      await replaceTags(client, userId, 'interest', patch.interests);
    }

    const updated = await client.query.users.findFirst({ where: eq(users.id, userId) });
    const [profile, tags] = await Promise.all([
      client.query.buddyProfiles.findFirst({ where: eq(buddyProfiles.userId, userId) }),
      readTags(client, userId),
    ]);

    return c.json({
      ...publicSelf(updated!),
      ...tags,
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

  /**
   * The same two-step upload as the avatar, for a Feed photo. Shares the PUT
   * handler below, which authorises on the key's prefix.
   */
  .post('/post-image', async (c) => {
    const userId = currentUserId(c);
    const key = postKeyFor(userId);
    return c.json({ key, uploadUrl: `/api/me/avatar/${encodeURIComponent(key)}` });
  })

  /**
   * And again for a proof photo (§2.4). Same two steps, same PUT handler; only
   * the prefix differs, and the prefix is what decides who may later read it.
   */
  .post('/proof-image', async (c) => {
    const userId = currentUserId(c);
    const key = proofKeyFor(userId);
    return c.json({ key, uploadUrl: `/api/me/avatar/${encodeURIComponent(key)}` });
  })

  .put('/avatar/:key{.+}', async (c) => {
    const userId = currentUserId(c);
    const key = decodeURIComponent(c.req.param('key'));

    // The key is client-supplied, so re-check ownership rather than trusting it.
    // Both prefixes are namespaced by user id, so one check covers avatars and
    // post images alike.
    const isAvatar = key.startsWith(`avatars/${userId}/`);
    const isPostImage = key.startsWith(`posts/${userId}/`);
    const isProofImage = key.startsWith(`proofs/${userId}/`);
    if (!isAvatar && !isPostImage && !isProofImage) {
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

    // A post or proof image is referenced by the row the client writes next —
    // the post, or the task's `proof_image_key` — not by a column here, so
    // there is nothing to update or clean up.
    if (isPostImage || isProofImage) return c.json({ avatarKey: null, key });

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

    return c.json({ avatarKey: key, key });
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

    // Their Feed photos, gathered before the rows go, so the R2 objects can be
    // removed too. See the note in the batch below for why this is by hand.
    const ownPosts = await client
      .select({ imageKey: posts.imageKey })
      .from(posts)
      .where(eq(posts.userId, userId));

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
      // Also explicit, and for the same reason: the Feed is global, so a soft
      // delete would leave a departed account's photos on a public surface
      // indefinitely. Unlike a chat message, a post is not part of anyone
      // else's history, so there is nothing lost by removing it outright.
      client.delete(posts).where(eq(posts.userId, userId)),
      client
        .update(refreshTokens)
        .set({ revokedAt: stamp })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))),
    ]);

    const objects = [user.avatarKey, ...ownPosts.map((row) => row.imageKey)].filter(
      (key): key is string => Boolean(key),
    );
    if (objects.length > 0) {
      c.executionCtx.waitUntil(c.env.STORAGE.delete(objects));
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
