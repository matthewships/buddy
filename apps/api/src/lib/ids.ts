import { ulid } from 'ulid';

/**
 * All primary keys are ULIDs: 26 characters, Crockford base32, with a
 * millisecond timestamp in the high bits. That makes them sortable by creation
 * time, so listings can page on `id` without a separate created_at index, and
 * unlike an autoincrement integer they don't leak row counts.
 */
export function newId(): string {
  return ulid();
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isId(value: string): boolean {
  return ULID_RE.test(value);
}
