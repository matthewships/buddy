import type { GroupDetail, GroupMember } from '@/api/groups';
import type { Task } from '@/api/tasks';

/**
 * Whether the viewer may review a given task — the client's copy of the rule in
 * `apps/api/src/services/review-rights.ts`.
 *
 * Duplicated deliberately, and only ever to decide whether to *show* a button.
 * The server is the authority and returns 403 regardless; what this avoids is
 * offering an action that will be refused, which is worse than not offering it.
 * If the two ever disagree, the server wins and the user sees an error — the
 * failure mode is a wasted tap, not a wrong outcome.
 */
export function canReview(
  group: Pick<GroupDetail, 'buddyUserId' | 'buddyVerifierId'>,
  members: GroupMember[],
  task: Pick<Task, 'userId'>,
  viewerId: string,
): boolean {
  // Nobody reviews their own work, whatever else is true.
  if (task.userId === viewerId) return false;

  const isMember = (id: string | null) => Boolean(id) && members.some((m) => m.id === id);
  const buddyId = isMember(group.buddyUserId) ? group.buddyUserId : null;

  // No Buddy named: the original rule, any member.
  if (!buddyId) return true;

  if (task.userId === buddyId) {
    // The Buddy's own tasks go to their nominee, or to anyone if there is none.
    const verifierId =
      group.buddyVerifierId && group.buddyVerifierId !== buddyId && isMember(group.buddyVerifierId)
        ? group.buddyVerifierId
        : null;
    return verifierId ? viewerId === verifierId : true;
  }

  return viewerId === buddyId;
}

/** Plain-language answer to "who checks this person?", for the group screen. */
export function verifierFor(
  group: Pick<GroupDetail, 'buddyUserId' | 'buddyVerifierId'>,
  members: GroupMember[],
  userId: string,
): string {
  const byId = (id: string | null) => members.find((m) => m.id === id);
  const buddy = byId(group.buddyUserId);
  if (!buddy) return 'Anyone in the group';

  if (userId === buddy.id) {
    const verifier = byId(group.buddyVerifierId);
    return verifier && verifier.id !== buddy.id ? verifier.displayName : 'Anyone in the group';
  }
  return buddy.displayName;
}
