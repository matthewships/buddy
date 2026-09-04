import { and, eq, or } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { groupMutes, userBlocks } from '../db/schema.js';

/**
 * Blocks and mutes (PRODUCT.md §6.1).
 *
 * A block is stored in one direction and read in both. Every query that lists
 * people — the directory, the feed, a chat history, a public profile — asks
 * the same question, "is either of us blocking the other?", and answers it
 * with `blockedIdsFor` (a set to exclude) or `isBlockedPair` (one pair).
 */

/** Every user the viewer has blocked, plus every user who has blocked the viewer. */
export async function blockedIdsFor(client: Db, viewerId: string): Promise<string[]> {
  const rows = await client
    .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, viewerId)));

  const ids = new Set<string>();
  for (const row of rows) ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
  return [...ids];
}

export async function isBlockedPair(client: Db, a: string, b: string): Promise<boolean> {
  const row = await client.query.userBlocks.findFirst({
    where: or(
      and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
      and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
    ),
    columns: { blockerId: true },
  });
  return Boolean(row);
}

/** Members who have muted this group, to leave out of its pushes. */
export async function mutedIdsFor(client: Db, groupId: string): Promise<Set<string>> {
  const rows = await client
    .select({ userId: groupMutes.userId })
    .from(groupMutes)
    .where(eq(groupMutes.groupId, groupId));
  return new Set(rows.map((row) => row.userId));
}
