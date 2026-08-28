import { zValidator } from '@hono/zod-validator';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { REPORT_STATUSES, createReportSchema, paginationSchema } from '@buddy/shared';

import { db } from '../db/client.js';
import { messages, reports, tasks, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { conflict, notFound, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { clientIp, enforceRateLimit } from '../lib/rate-limit.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';

/**
 * Reports (§2.6).
 *
 * `[DECISION]` resolved: **manual review only**, no auto-hide after N reports.
 * Auto-hiding is trivially weaponised by a small group against one person, and
 * with a single admin at this scale there is nothing a threshold buys that a
 * queue does not. The schema keeps `status` so an auto-hide can be layered on
 * later without a migration.
 *
 * One report per person per target, enforced by a unique index: re-reporting the
 * same thing is a no-op rather than a way to inflate a count.
 */
export const reportRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .post('/', zValidator('json', createReportSchema), async (c) => {
    const { targetType, targetId, reason, note } = c.req.valid('json');
    const reporterId = currentUserId(c);
    await enforceRateLimit(c.env.CACHE, 'report', `${reporterId}:${clientIp(c.req.raw)}`);

    const client = db(c.env.DB);

    // Verify the target exists, so the queue cannot be filled with noise.
    const exists =
      targetType === 'task'
        ? await client.query.tasks.findFirst({ where: eq(tasks.id, targetId), columns: { id: true } })
        : targetType === 'message'
          ? await client.query.messages.findFirst({
              where: eq(messages.id, targetId),
              columns: { id: true },
            })
          : await client.query.users.findFirst({
              where: eq(users.id, targetId),
              columns: { id: true },
            });
    if (!exists) throw notFound('There is nothing there to report');

    const inserted = await client
      .insert(reports)
      .values({
        id: newId(),
        reporterId,
        targetType,
        targetId,
        reason,
        note: note ?? null,
        status: 'open',
      })
      .onConflictDoNothing()
      .returning({ id: reports.id });

    // Already reported by this person: report it as accepted rather than as an
    // error. They did what they meant to; telling them otherwise is confusing.
    return c.json({ ok: true as const, alreadyReported: inserted.length === 0 }, 201);
  });

/**
 * The admin queue (§4.4). Guarded by a bearer `ADMIN_TOKEN` secret rather than a
 * user role: there is exactly one operator, and a role column would be a
 * privilege-escalation surface for no benefit.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use('*', async (c, next) => {
    const expected = c.env.ADMIN_TOKEN;
    // With no token configured the endpoints are closed, not open.
    if (!expected) throw unauthorized('Admin access is not configured');

    const header = c.req.header('authorization') ?? '';
    const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';

    if (presented.length !== expected.length) throw unauthorized();
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
      diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) throw unauthorized();

    await next();
  })

  .get(
    '/reports',
    zValidator(
      'query',
      paginationSchema.extend({ status: z.enum(REPORT_STATUSES).default('open') }),
    ),
    async (c) => {
      const { status, limit } = c.req.valid('query');
      const client = db(c.env.DB);

      const rows = await client
        .select({
          id: reports.id,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          note: reports.note,
          status: reports.status,
          createdAt: reports.createdAt,
          reporterHandle: users.handle,
        })
        .from(reports)
        .innerJoin(users, eq(users.id, reports.reporterId))
        .where(eq(reports.status, status))
        // Oldest first: a queue, not a feed.
        .orderBy(reports.createdAt)
        .limit(limit);

      return c.json({ reports: rows });
    },
  )

  /** Resolves a report, optionally soft-deleting the offending content. */
  .patch(
    '/reports/:id',
    zValidator(
      'json',
      z.object({
        status: z.enum(['actioned', 'dismissed']),
        hideContent: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const id = c.req.param('id');
      const { status, hideContent } = c.req.valid('json');
      const client = db(c.env.DB);

      const report = await client.query.reports.findFirst({ where: eq(reports.id, id) });
      if (!report) throw notFound('No such report');
      if (report.status !== 'open') throw conflict('That report is already resolved');

      await client
        .update(reports)
        .set({ status, resolvedAt: nowIso() })
        .where(and(eq(reports.id, id), eq(reports.status, 'open')));

      if (hideContent && report.targetType === 'message') {
        // Soft delete: history stays auditable, the message stops being served.
        await client
          .update(messages)
          .set({ deletedAt: nowIso() })
          .where(eq(messages.id, report.targetId));
      }

      return c.json({ ok: true as const, status });
    },
  )

  /** A count per status, so the operator knows whether the queue needs attention. */
  .get('/reports/summary', async (c) => {
    const rows = await db(c.env.DB)
      .select({ status: reports.status, count: sql<number>`count(*)` })
      .from(reports)
      .groupBy(reports.status);

    const counted = new Map(rows.map((row) => [row.status, Number(row.count)]));
    // Every status is present in the response, so the client never has to treat
    // "absent" and "zero" differently.
    return c.json({
      counts: Object.fromEntries(
        REPORT_STATUSES.map((status) => [status, counted.get(status) ?? 0]),
      ),
    });
  });
