import { and, eq, inArray } from 'drizzle-orm';

import type { UserTagKind } from '@buddy/shared';

import { userTags } from '../db/schema.js';
import type { Db } from '../db/client.js';

/**
 * Topics and hobbies (§2.1), stored one row per tag in `user_tags`.
 *
 * `replaceTags` is replace-a-set, not merge: the client sends the complete list
 * for a kind, and what it sends is what the user then has. Merging would make
 * *removing* a topic impossible without a second endpoint, and the profile
 * editor deselects chips as readily as it selects them.
 *
 * Only the difference is written. A profile save that touches a bio and leaves
 * the chips alone would otherwise delete and reinsert five rows for no reason,
 * and each of those is a D1 round trip.
 */
export async function replaceTags(
  client: Db,
  userId: string,
  kind: UserTagKind,
  values: readonly string[],
): Promise<void> {
  const existing = await client
    .select({ value: userTags.value })
    .from(userTags)
    .where(and(eq(userTags.userId, userId), eq(userTags.kind, kind)));

  const before = new Set(existing.map((row) => row.value));
  const after = new Set(values);

  const removed = [...before].filter((value) => !after.has(value));
  const added = [...after].filter((value) => !before.has(value));
  if (removed.length === 0 && added.length === 0) return;

  const remove = removed.length
    ? client
        .delete(userTags)
        .where(
          and(
            eq(userTags.userId, userId),
            eq(userTags.kind, kind),
            inArray(userTags.value, removed),
          ),
        )
    : null;
  const insert = added.length
    ? client.insert(userTags).values(added.map((value) => ({ userId, kind, value })))
    : null;

  // Written out rather than collected into an array: `batch` is typed as a
  // non-empty tuple, and building one dynamically only type-checks behind a
  // cast that would hide a genuinely empty batch.
  if (remove && insert) await client.batch([remove, insert]);
  else if (remove) await remove;
  else if (insert) await insert;
}

/** Both kinds for one user, split, in the order the lists define. */
export async function readTags(
  client: Db,
  userId: string,
): Promise<{ topics: string[]; interests: string[] }> {
  const rows = await client
    .select({ kind: userTags.kind, value: userTags.value })
    .from(userTags)
    .where(eq(userTags.userId, userId));

  return {
    topics: rows.filter((r) => r.kind === 'topic').map((r) => r.value),
    interests: rows.filter((r) => r.kind === 'interest').map((r) => r.value),
  };
}
