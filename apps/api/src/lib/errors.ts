import { HTTPException } from 'hono/http-exception';

/**
 * Every error the API returns has the same JSON shape:
 *   { error: { code, message, details? } }
 *
 * `code` is a stable machine-readable string the app switches on; `message` is
 * safe to show a user. Handlers throw these rather than returning ad-hoc
 * responses, so the shape can't drift between routes.
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'rate_limited'
  | 'internal';

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  rate_limited: 429,
  internal: 500,
};

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function apiError(code: ErrorCode, message: string, details?: unknown): HTTPException {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return new HTTPException(STATUS[code], {
    res: Response.json(body, { status: STATUS[code] }),
  });
}

export const badRequest = (m: string, d?: unknown) => apiError('bad_request', m, d);
export const unauthorized = (m = 'Sign in to continue') => apiError('unauthorized', m);
export const forbidden = (m = "You don't have access to that") => apiError('forbidden', m);
export const notFound = (m = 'Not found') => apiError('not_found', m);
export const conflict = (m: string, d?: unknown) => apiError('conflict', m, d);
/** 410: the buddy request existed but its 5-minute window closed (§4.4). */
export const gone = (m: string) => apiError('gone', m);
export const rateLimited = (m = 'Too many attempts — try again shortly') =>
  apiError('rate_limited', m);
