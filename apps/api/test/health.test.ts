import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { newId } from '../src/lib/ids.js';

/**
 * Phase 0's exit criteria: the Worker boots inside workerd, the D1 binding is
 * real, and the generated migration produces the schema the code expects.
 */
describe('health', () => {
  it('responds ok', async () => {
    const res = await SELF.fetch('https://api.test/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('reports the migrated tables through the D1 binding', async () => {
    const res = await SELF.fetch('https://api.test/health/db');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; tables: number };
    // 16 application tables plus D1's own d1_migrations bookkeeping table.
    expect(body.tables).toBeGreaterThanOrEqual(16);
  });

  it('returns the shared error shape for an unknown route', async () => {
    const res = await SELF.fetch('https://api.test/nope');
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'not_found', message: 'Not found' },
    });
  });
});

describe('schema', () => {
  it('round-trips a user through Drizzle', async () => {
    const client = db(env.DB);
    const id = newId();
    await client.insert(users).values({
      id,
      email: 'masoud@example.com',
      passwordHash: 'x',
      passwordSalt: 'y',
      handle: 'masoud',
      displayName: 'Masoud',
      timezone: 'Asia/Muscat',
    });

    const row = await client.query.users.findFirst();
    expect(row).toMatchObject({
      id,
      email: 'masoud@example.com',
      handle: 'masoud',
      // Defaults applied by the migration, not by the insert.
      isOpenBuddy: false,
    });
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects a goal_key the shared list does not define', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, password_salt, handle, display_name, goal_key) VALUES (?, ?, 'x', 'y', ?, 'Bad', 'become_a_wizard')",
      )
        .bind(newId(), 'bad@example.com', 'badgoal')
        .run(),
    ).rejects.toThrow();
  });

  it('allows only one pending buddy request per requester', async () => {
    const client = db(env.DB);
    const [a, b, c] = [newId(), newId(), newId()];
    for (const [i, id] of [a, b, c].entries()) {
      await client.insert(users).values({
        id,
        email: `u${i}@example.com`,
        passwordHash: 'x',
        passwordSalt: 'y',
        handle: `user${i}`,
        displayName: `User ${i}`,
      });
    }

    const insertRequest = (to: string) =>
      env.DB.prepare(
        "INSERT INTO buddy_requests (id, from_user_id, to_user_id, status, expires_at) VALUES (?, ?, ?, 'pending', ?)",
      )
        .bind(newId(), a, to, new Date(Date.now() + 300_000).toISOString())
        .run();

    await insertRequest(b);
    // The partial unique index is what enforces §2.2, not handler logic.
    await expect(insertRequest(c)).rejects.toThrow();
  });

  it('refuses a rating on a request_proof review', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO task_reviews (id, task_id, reviewer_id, action, rating) VALUES (?, ?, ?, 'request_proof', 5)",
      )
        .bind(newId(), newId(), newId())
        .run(),
    ).rejects.toThrow();
  });
});
