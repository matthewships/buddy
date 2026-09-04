import { and, eq, ne } from 'drizzle-orm';

import { groupMembers, groups } from '../db/schema.js';
import type { Db } from '../db/client.js';

/**
 * Who may review a given task (§2.4).
 *
 * The rule has three branches, and the first one is why this is a function
 * rather than an inline check:
 *
 * 1. **No Buddy set** — any member except the owner, which is the original rule.
 *    Every group created before Buddies existed is in this state, and so is
 *    every group the mobile app makes, so this branch is what keeps them working
 *    rather than a courtesy.
 * 2. **Someone else's task** — only the group's Buddy. That is the point of
 *    naming one: a single person holding the standard, instead of whoever taps
 *    first.
 * 3. **The Buddy's own task** — the member the Buddy nominated, falling back to
 *    any member when nobody is nominated or the nominee has since left. Nobody
 *    may approve their own task, so without that fallback a lone verifier who
 *    walked away would leave the Buddy's tasks permanently unreviewable.
 */
export interface ReviewRights {
  allowed: boolean;
  /** Who to notify when the task is marked done. Empty means every member. */
  reviewerIds: string[];
  reason?: string;
}

async function memberIds(client: Db, groupId: string, exceptUserId: string): Promise<string[]> {
  const rows = await client
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, exceptUserId)));
  return rows.map((row) => row.userId);
}

async function isMember(client: Db, groupId: string, userId: string): Promise<boolean> {
  const row = await client.query.groupMembers.findFirst({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    columns: { userId: true },
  });
  return Boolean(row);
}

/**
 * Resolves the rule for one task. `reviewerId` is optional: called without it
 * this answers "who should be told about this?", which is what marking a task
 * done needs.
 */
export async function reviewRightsFor(
  client: Db,
  task: { groupId: string; userId: string },
  reviewerId?: string,
): Promise<ReviewRights> {
  const group = await client.query.groups.findFirst({
    where: eq(groups.id, task.groupId),
    columns: { buddyUserId: true, buddyVerifierId: true },
  });

  const buddyId = group?.buddyUserId ?? null;

  // Branch 1: no Buddy — the original rule, untouched.
  if (!buddyId || !(await isMember(client, task.groupId, buddyId))) {
    return {
      allowed: reviewerId ? reviewerId !== task.userId : true,
      reviewerIds: await memberIds(client, task.groupId, task.userId),
    };
  }

  // Branch 3: the Buddy's own task goes to their nominee, or to anyone.
  if (task.userId === buddyId) {
    const verifierId = group?.buddyVerifierId ?? null;
    const verifierStillHere =
      verifierId && verifierId !== buddyId && (await isMember(client, task.groupId, verifierId));

    if (!verifierStillHere) {
      return {
        allowed: reviewerId ? reviewerId !== task.userId : true,
        reviewerIds: await memberIds(client, task.groupId, task.userId),
      };
    }

    return {
      allowed: reviewerId ? reviewerId === verifierId : true,
      reviewerIds: [verifierId],
      reason: 'Only the member the Buddy nominated can review their tasks',
    };
  }

  // Branch 2: everyone else answers to the Buddy.
  return {
    allowed: reviewerId ? reviewerId === buddyId : true,
    reviewerIds: [buddyId],
    reason: "Only this group's Buddy can review tasks here",
  };
}
