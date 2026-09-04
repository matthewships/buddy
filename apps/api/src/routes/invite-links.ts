import { zValidator } from '@hono/zod-validator';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { inviteTokenSchema } from '@buddy/shared';

import { db, type Db } from '../db/client.js';
import { groupInviteLinks, groupMembers, groups, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { gone, notFound } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';

/**
 * Join links (§2.3) — the path in for someone who is not a user yet.
 *
 * The preview below is **unauthenticated**, which is the whole point and worth
 * being deliberate about. Someone arriving from a WhatsApp message is about to
 * be asked nine questions, an email address and a password; asking all that
 * before telling them what they are joining is how you lose them. The link
 * already grants entry to anyone holding it, so naming the group to a holder
 * discloses nothing the link itself does not.
 *
 * What it deliberately does **not** disclose is the member list — only the group
 * name and who invited them. A leaked link should not become a roster.
 */

interface LinkState {
  link: typeof groupInviteLinks.$inferSelect;
  group: { id: string; name: string; emoji: string | null };
  inviterName: string;
}

/** Resolves a token, or throws the reason it cannot be used. */
async function resolveLink(client: Db, token: string): Promise<LinkState> {
  const link = await client.query.groupInviteLinks.findFirst({
    where: eq(groupInviteLinks.token, token),
  });
  if (!link) throw notFound('That invite link is not valid');
  if (link.revokedAt !== null) throw gone('That invite link was withdrawn');
  if (link.expiresAt < nowIso()) throw gone('That invite link has expired');
  if (link.uses >= link.maxUses) throw gone('That invite link has been used up');

  const group = await client.query.groups.findFirst({ where: eq(groups.id, link.groupId) });
  if (!group) throw notFound('That group no longer exists');

  const inviter = await client.query.users.findFirst({
    where: eq(users.id, link.createdBy),
    columns: { displayName: true },
  });

  return {
    link,
    group: { id: group.id, name: group.name, emoji: group.emoji },
    inviterName: inviter?.displayName ?? 'Someone',
  };
}

const tokenParam = z.object({ token: inviteTokenSchema });

export const inviteLinkRoutes = new Hono<AppEnv>()

  /** The preview, before signup. No auth — see the note above. */
  .get('/:token', zValidator('param', tokenParam), async (c) => {
    const { token } = c.req.valid('param');
    const state = await resolveLink(db(c.env.DB), token);

    return c.json({
      group: { name: state.group.name, emoji: state.group.emoji },
      invitedBy: state.inviterName,
      valid: true as const,
    });
  })

  /**
   * Redeeming. Authenticated, so this is where the signup flow lands a brand-new
   * account once it has one.
   */
  .post('/:token/accept', requireAuth, zValidator('param', tokenParam), async (c) => {
    const { token } = c.req.valid('param');
    const userId = currentUserId(c);
    const client = db(c.env.DB);

    const state = await resolveLink(client, token);

    const already = await client.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, state.group.id),
        eq(groupMembers.userId, userId),
      ),
    });
    // Not an error: following your own group's link should land you in the
    // group, which is exactly where you already are.
    if (already) return c.json({ group: state.group, joined: false as const });

    /**
     * Claim a use *before* joining, with a guarded UPDATE rather than a
     * read-then-write. The cap is the only thing bounding a link that has been
     * forwarded further than intended, so it has to hold when two people redeem
     * the last use at the same moment — and it only holds if the claim is the
     * thing that decides, not a count read a moment earlier.
     *
     * The cost of this order is that a failure between claiming and joining
     * burns a use. That is the right way round: a wasted use is a minor
     * annoyance, an unbounded invite link is a security problem.
     */
    const claimed = await client
      .update(groupInviteLinks)
      .set({ uses: sql`${groupInviteLinks.uses} + 1` })
      .where(
        and(
          eq(groupInviteLinks.id, state.link.id),
          sql`${groupInviteLinks.uses} < ${groupInviteLinks.maxUses}`,
        ),
      )
      .returning({ id: groupInviteLinks.id });

    if (claimed.length === 0) throw gone('That invite link has been used up');

    await client.insert(groupMembers).values({
      groupId: state.group.id,
      userId,
      role: 'member',
    });

    return c.json({ group: state.group, joined: true as const });
  });
