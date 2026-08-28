/**
 * The Web Push service worker (§4.6).
 *
 * This is the whole reason the web client can be notified with no tab open: a
 * service worker is woken by the browser to handle a `push` event, runs for a
 * few hundred milliseconds, shows a notification and is shut down again.
 *
 * It is deliberately the smallest thing that can do that job:
 *
 * - **No caching, no fetch handler.** Offline support is not what this is for,
 *   and a cache here would quietly serve stale HTML after a deploy.
 * - **No API calls.** Session tokens live in `localStorage`, which a service
 *   worker cannot read, so it has no way to authenticate anything. Everything
 *   it needs arrives inside the push payload.
 * - **Plain JavaScript, served from `public/`.** It has to sit at the origin
 *   root to control the whole scope, and it is not part of the bundle graph.
 *
 * Because it cannot re-subscribe on its own (that would mean telling the server,
 * which means authenticating), `pushsubscriptionchange` is handled by the page
 * instead: the app re-posts `getSubscription()` on every load.
 */

/** Take over from a previous version on the next load rather than the one after. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/**
 * The API sends `{ title, body, data }`, where `data` is the same routing
 * payload the Expo notification carries.
 *
 * `userVisibleOnly: true` is a condition of the subscription: a push that shows
 * no notification will, after a few offences, cost the site its permission. So
 * every path here ends in `showNotification`, including the ones where the
 * payload is missing or unreadable.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Not JSON. Still has to show something.
  }

  const data = payload.data ?? {};
  const title = payload.title || 'Buddy';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      // One notification per thing, not per delivery: a second message in the
      // same chat replaces the first instead of stacking. The type alone is too
      // coarse (two different buddy requests would collapse into one) and the
      // whole payload too fine, so it is the type plus whatever id it carries.
      tag: notificationTag(data),
      // Buddy requests expire in five minutes; a tap has to be possible while
      // the answer still matters, so the notification stays until it is acted
      // on rather than auto-dismissing.
      requireInteraction: data.type === 'buddy_request',
      data,
    }),
  );
});

function notificationTag(data) {
  const id = data.requestId || data.taskId || data.inviteId || data.groupId;
  return id ? `${data.type}:${id}` : data.type || 'buddy';
}

/**
 * A tap goes to the screen the notification is about, reusing an open tab when
 * there is one — opening a second copy of the app is both slower and a way to
 * lose whatever the user had typed in the first.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(webPath(event.notification.data?.url), self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== target.origin) continue;
        // `navigate` can reject on a client this worker does not control. The
        // tab is focused by then, so the tap has already done most of its job —
        // opening a second copy of the app on top of it would be worse than
        // landing on the wrong screen.
        return client
          .focus()
          .then((focused) =>
            focused?.navigate
              ? focused.navigate(target.href).catch(() => focused)
              : focused,
          )
          .catch(() => self.clients.openWindow(target.href));
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

/**
 * The payload's `url` is written for Expo Router, whose route groups are part
 * of the path — `/(tabs)/today`. Next has the same route groups but strips them
 * from the URL, so the web path is the same string with the parenthesised
 * segments removed: `/(tabs)/buddies` → `/buddies`, and `/groups/:id/chat`,
 * which has none, unchanged.
 *
 * Rewriting here rather than sending two urls keeps one payload for both
 * clients, and keeps the mapping next to the client it is a quirk of.
 */
function webPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return '/today';
  const path = url.replace(/\/\([^)]*\)/g, '');
  return path === '' ? '/today' : path;
}
