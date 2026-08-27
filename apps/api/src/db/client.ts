import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';

import * as schema from './schema.js';

export type Db = DrizzleD1Database<typeof schema>;

/**
 * One Drizzle instance per request. D1 bindings are cheap to wrap, and a
 * per-request client avoids sharing state across the isolate's concurrent
 * requests.
 */
export function db(d1: D1Database): Db {
  return drizzle(d1, { schema });
}

export { schema };
