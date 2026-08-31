import { Hono } from 'hono';

import type { AppEnv } from '../env.js';
import { badRequest, notFound } from '../lib/errors.js';

/**
 * Serves uploaded media from R2 (§4.1).
 *
 * **Deliberately unauthenticated.** Avatars appear on directory cards, group
 * member lists and public profiles, so every signed-in user can already see
 * them — and requiring a bearer token would mean every image request carried
 * one, defeating both the CDN cache and `expo-image`'s own caching. Instead the
 * key embeds a ULID (`avatars/<userId>/<ulid>`), which is unguessable, and
 * replacing an avatar deletes the old object so a leaked URL stops resolving.
 *
 * The same reasoning extends to `posts/` (§2.7): the Feed is global, so every
 * signed-in user can already see every post, and a bearer token on an <img> tag
 * would defeat the CDN cache for no privacy gained. Deleting a post deletes the
 * object, so a leaked URL stops resolving.
 *
 * Nothing else is served. Proof images, if they are ever added, are
 * group-private and will need a different, authenticated path.
 */
export const mediaRoutes = new Hono<AppEnv>().get('/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));

  if ((!key.startsWith('avatars/') && !key.startsWith('posts/')) || key.includes('..')) {
    throw badRequest('Not a media key');
  }

  const object = await c.env.STORAGE.get(key);
  if (!object) throw notFound('No such image');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Keys are content-addressed by ULID and never rewritten, so this is safe to
  // cache hard — a new avatar is a new key.
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
});
