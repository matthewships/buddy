import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { BASE, createTask, get, pair, post, resetRateLimits } from './helpers.js';

/** The uploads are binary, so they bypass the JSON `put` helper. */
async function putImage(uploadUrl: string, token: string) {
  return SELF.fetch(`${BASE}${uploadUrl}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]),
  });
}

beforeEach(resetRateLimits);

/**
 * A proof photo is the one upload that is not world-readable to signed-in
 * users, so the read path is the part worth testing: a group-mate sees it, and
 * nobody else learns it exists.
 */
describe('proof photos', () => {
  it('accepts an upload under the caller’s own prefix and serves it to the group', async () => {
    const { owner, buddy, groupId } = await pair('proof-ok');
    const id = await createTask(owner, groupId, 'Problem set 7');

    const { key, uploadUrl } = (await (
      await post('/api/me/proof-image', {}, owner.accessToken)
    ).json()) as { key: string; uploadUrl: string };
    expect(key.startsWith('proofs/')).toBe(true);

    const put = await putImage(uploadUrl, owner.accessToken);
    expect(put.status).toBe(200);

    const done = await post(
      `/api/tasks/${id}/done`,
      { proofText: 'All eight questions', proofImageKey: key },
      owner.accessToken,
    );
    expect(done.status).toBe(200);

    // The reviewer is in the group, so the photo resolves for them.
    const seen = await get(`/api/tasks/${id}/proof-image`, buddy.accessToken);
    expect(seen.status).toBe(200);
    expect(seen.headers.get('cache-control')).toBe('private, no-store');
  });

  it('hides the photo from somebody outside the group', async () => {
    const { owner, groupId } = await pair('proof-in');
    const outsider = await pair('proof-out');
    const id = await createTask(owner, groupId, 'Read two papers');

    const { key, uploadUrl } = (await (
      await post('/api/me/proof-image', {}, owner.accessToken)
    ).json()) as { key: string; uploadUrl: string };

    await putImage(uploadUrl, owner.accessToken);
    await post(`/api/tasks/${id}/done`, { proofImageKey: key }, owner.accessToken);

    // 404 rather than 403: a stranger should not learn the task exists.
    const res = await get(`/api/tasks/${id}/proof-image`, outsider.owner.accessToken);
    expect(res.status).toBe(404);

    // And no token at all is simply unauthenticated.
    const anon = await get(`/api/tasks/${id}/proof-image`);
    expect(anon.status).toBe(401);
  });

  it('refuses a proof key belonging to somebody else', async () => {
    const { owner, groupId } = await pair('proof-steal-a');
    const other = await pair('proof-steal-b');
    const id = await createTask(owner, groupId, 'Rewrite the methods section');

    const { key: theirKey } = (await (
      await post('/api/me/proof-image', {}, other.owner.accessToken)
    ).json()) as { key: string };

    const res = await post(
      `/api/tasks/${id}/done`,
      { proofImageKey: theirKey },
      owner.accessToken,
    );
    expect(res.status).toBe(400);
  });
});
