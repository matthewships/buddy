import { beforeEach, describe, expect, it } from 'vitest';

import { addMember, get, pair, put, resetRateLimits, type Session } from './helpers.js';

beforeEach(resetRateLimits);

async function setBuddy(
  session: Session,
  groupId: string,
  buddyUserId: string | null,
  verifierUserId: string | null = null,
) {
  return put(`/api/groups/${groupId}/buddy`, { buddyUserId, verifierUserId }, session.accessToken);
}

async function buddyOf(session: Session, groupId: string) {
  const res = await get(`/api/groups/${groupId}`, session.accessToken);
  const body = (await res.json()) as {
    group: { buddyUserId: string | null; buddyVerifierId: string | null };
  };
  return body.group;
}

/**
 * Who may change the person that decides whether your work counts.
 *
 * This used to be anyone in the group, which meant the member facing a review
 * they did not like could simply appoint themselves — accountability with an
 * opt-out is not accountability. The first naming stays open, because a group
 * with no Buddy is already on the weaker any-member rule.
 */
describe('naming the group Buddy', () => {
  it('lets any member name the first one', async () => {
    const { owner, buddy, groupId } = await pair('govfirst');

    // Not the group's creator, and there is no Buddy yet.
    const res = await setBuddy(buddy, groupId, buddy.userId);

    expect(res.status).toBe(200);
    expect((await buddyOf(owner, groupId)).buddyUserId).toBe(buddy.userId);
  });

  it('stops an ordinary member reassigning one that is already named', async () => {
    const { owner, buddy, groupId } = await pair('govtakeover');
    const third = await addMember(owner, groupId, 'govtakeover-3@example.com', 'govtakeover3');
    await setBuddy(owner, groupId, buddy.userId);

    // The classic abuse: the person being checked installs themselves.
    const res = await setBuddy(third, groupId, third.userId);

    expect(res.status).toBe(403);
    expect((await buddyOf(owner, groupId)).buddyUserId).toBe(buddy.userId);
  });

  it('lets whoever made the group change it', async () => {
    const { owner, buddy, groupId } = await pair('govowner');
    const third = await addMember(owner, groupId, 'govowner-3@example.com', 'govowner3');
    await setBuddy(owner, groupId, buddy.userId);

    const res = await setBuddy(owner, groupId, third.userId);

    expect(res.status).toBe(200);
    expect((await buddyOf(owner, groupId)).buddyUserId).toBe(third.userId);
  });

  it('lets the Buddy put the job down', async () => {
    const { owner, buddy, groupId } = await pair('govstepdown');
    await setBuddy(owner, groupId, buddy.userId);

    // Nobody should be trapped in the role by whoever assigned it.
    const res = await setBuddy(buddy, groupId, null);

    expect(res.status).toBe(200);
    expect((await buddyOf(owner, groupId)).buddyUserId).toBeNull();
  });

  it('stops an ordinary member clearing one to escape review', async () => {
    const { owner, buddy, groupId } = await pair('govescape');
    const third = await addMember(owner, groupId, 'govescape-3@example.com', 'govescape3');
    await setBuddy(owner, groupId, buddy.userId);

    const res = await setBuddy(third, groupId, null);

    expect(res.status).toBe(403);
    expect((await buddyOf(owner, groupId)).buddyUserId).toBe(buddy.userId);
  });
});

describe('who checks the Buddy', () => {
  it('is the Buddy’s own call', async () => {
    const { owner, buddy, groupId } = await pair('govnominate');
    const third = await addMember(owner, groupId, 'govnominate-3@example.com', 'govnominate3');
    await setBuddy(owner, groupId, buddy.userId);

    const res = await setBuddy(buddy, groupId, buddy.userId, third.userId);

    expect(res.status).toBe(200);
    expect((await buddyOf(owner, groupId)).buddyVerifierId).toBe(third.userId);
  });

  it('cannot be installed by the person the Buddy reviews', async () => {
    const { owner, buddy, groupId } = await pair('govinstall');
    const third = await addMember(owner, groupId, 'govinstall-3@example.com', 'govinstall3');
    await setBuddy(owner, groupId, buddy.userId);

    // `third` naming themselves as the Buddy's checker is the same escape
    // route by a quieter door.
    const res = await setBuddy(third, groupId, buddy.userId, third.userId);

    expect(res.status).toBe(403);
    expect((await buddyOf(owner, groupId)).buddyVerifierId).toBeNull();
  });

  it('still refuses a Buddy who would check themselves', async () => {
    const { owner, buddy, groupId } = await pair('govself');
    await setBuddy(owner, groupId, buddy.userId);

    const res = await setBuddy(buddy, groupId, buddy.userId, buddy.userId);

    expect(res.status).toBe(400);
  });
});
