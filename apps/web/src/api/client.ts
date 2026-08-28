import { hc } from 'hono/client';

import type { AppType } from '@buddy/api';

import { API_URL, getAccessToken, refreshSession } from '../auth/session';

/**
 * The typed API client, identical in shape to apps/mobile/src/api/client.ts.
 *
 * `hc<AppType>()` builds the client from the Worker's own route definitions, so
 * a route removed or a response shape changed in apps/api becomes a type error
 * in *both* front ends rather than a runtime surprise in one of them. That is
 * what keeps this app and the Expo app from drifting apart against the API
 * despite being separate copies of the data layer.
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

/**
 * The API's error envelope: `{ error: { code, message } }`. `message` is written
 * to be shown to a user, so it is surfaced as-is rather than replaced with
 * client-side copy that could contradict the server.
 */
interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Structural rather than `Response`, matching the mobile module. Hono's
 * `ClientResponse` is assignable to the DOM `Response` here, so this is not
 * strictly necessary on web — it is kept so the two copies of every hook below
 * stay textually identical and easy to diff.
 */
export interface JsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export async function unwrap<T>(response: JsonResponse): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let message = 'Something went wrong';
  let code: string | undefined;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error?.message) message = body.error.message;
    code = body.error?.code;
  } catch {
    // A non-JSON error body (a gateway page, say) keeps the default message.
  }
  throw new ApiError(message, response.status, code);
}
