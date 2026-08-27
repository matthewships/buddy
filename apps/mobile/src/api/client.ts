import { hc } from 'hono/client';

import type { AppType } from '@buddy/api';

import { API_URL, getAccessToken, refreshSession } from '../auth/session';

/**
 * The typed API client (§5.1).
 *
 * `hc<AppType>()` builds the client from the Worker's own route definitions, so
 * a route removed or a response shape changed in apps/api becomes a type error
 * here rather than a runtime surprise.
 */
export { API_URL };

/**
 * Attaches the access token and, on a 401, refreshes once and replays the
 * request. Concurrent 401s share a single refresh via the promise held in
 * `session`, so a burst of requests cannot trigger a stampede of refreshes.
 */
const authedFetch: typeof fetch = async (input, init) => {
  const withAuth = async (): Promise<RequestInit> => {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };

  let response = await fetch(input, await withAuth());

  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await fetch(input, await withAuth());
    }
  }

  return response;
};

export const api = hc<AppType>(API_URL, { fetch: authedFetch });
