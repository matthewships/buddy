import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addMember,
  createTask,
  get,
  pair,
  post,
  put,
  resetRateLimits,
  statsFor,
  type Session,
} from './helpers.js';

beforeEach(resetRateLimits);

/** Marks a task done so it is waiting for a review. */
async function markDone(session: Session, taskId: string) {
  const res = await post(`/api/tasks/${taskId}/done`, {}, session.accessToken);
  expect(res.status).toBe(200);
}

async function review(session: Session, taskId: string) {
  return post(`/api/tasks/${taskId}/review`, { action: 'approve', rating: 4 }, session.accessToken);
}

describe('who may review', () => {
  it('lets any member review when no Buddy is set', async () => {
    // The original rule, and the one every existing group and the mobile app
    // still rely on. It has to keep working untouched.
    const { owner, buddy, groupId } = await pair('nobuddy');
    const third = await addMember(owner, groupId, 'nb-third@example.com', 'nbthird');

    const taskId = await createTask(owner, groupId);
    await markDone(owner, taskId);

    expect((await review(third, taskId)).status).toBe(200);
    expect(buddy.userId).not.toBe(third.userId);
  });

  it('lets only the Buddy review once one is named', async () => {
    const { owner, buddy, groupId } = await pair('hasbuddy');
    const third = await addMember(owner, groupId, 'hb-third@example.com', 'hbthird');

    await put(`/api/groups/${groupId}/buddy`, { buddyUserId: buddy.userId }, owner.accessToken);

    const taskId = await createTask(owner, groupId);
    await markDone(owner, taskId);

    // The third member is in the group but is not the Buddy.
    expect((await review(third, taskId)).status).toBe(403);
    expect((await review(buddy, taskId)).status).toBe(200);
  });

  it('sends the Buddy’s own tasks to the member they nominated', async () => {
    const { owner, buddy, groupId } = await pair('nominee');
    const third = await addMember(owner, groupId, 'nom-third@example.com', 'nomthird');

    await put(
      `/api/groups/${groupId}/buddy`,
      { buddyUserId: buddy.userId, verifierUserId: third.userId },
      owner.accessToken,
    );

    const taskId = await createTask(buddy, groupId);
    await markDone(buddy, taskId);

    // The owner is a member, but the Buddy nominated the third member.
    expect((await review(owner, taskId)).status).toBe(403);
    expect((await review(third, taskId)).status).toBe(200);
  });

  it('falls back to any member when the Buddy nominated nobody', async () => {
    // Without this, a lone verifier who was never chosen would leave the
    // Buddy's own tasks permanently unreviewable.
    const { owner, buddy, groupId } = await pair('nonominee');
    await put(`/api/groups/${groupId}/buddy`, { buddyUserId: buddy.userId }, owner.accessToken);

    const taskId = await createTask(buddy, groupId);
    await markDone(buddy, taskId);

    expect((await review(owner, taskId)).status).toBe(200);
  });

  it('falls back when the nominated verifier has left', async () => {
    const { owner, buddy, groupId } = await pair('goneverifier');
    const third = await addMember(owner, groupId, 'gv-third@example.com', 'gvthird');

    await put(
      `/api/groups/${groupId}/buddy`,
      { buddyUserId: buddy.userId, verifierUserId: third.userId },
      owner.accessToken,
    );
    await post(`/api/groups/${groupId}/leave`, {}, third.accessToken);

    const taskId = await createTask(buddy, groupId);
    await markDone(buddy, taskId);

    expect((await review(owner, taskId)).status).toBe(200);
  });

  it('still refuses to let anyone review their own task', async () => {
    const { owner, buddy, groupId } = await pair('ownreview');
    await put(`/api/groups/${groupId}/buddy`, { buddyUserId: buddy.userId }, owner.accessToken);

    const taskId = await createTask(buddy, groupId);
    await markDone(buddy, taskId);

    expect((await review(buddy, taskId)).status).toBe(403);
  });

  it('refuses a Buddy who verifies themselves', async () => {
    const { owner, buddy, groupId } = await pair('selfverify');
    const res = await put(
      `/api/groups/${groupId}/buddy`,
      { buddyUserId: buddy.userId, verifierUserId: buddy.userId },
      owner.accessToken,
    );
    expect(res.status).toBe(400);
  });

  it('clears the roles when the Buddy leaves', async () => {
    const { owner, buddy, groupId } = await pair('buddyleaves');
    await put(`/api/groups/${groupId}/buddy`, { buddyUserId: buddy.userId }, owner.accessToken);
    await post(`/api/groups/${groupId}/leave`, {}, buddy.accessToken);

    const row = await env.DB.prepare('SELECT buddy_user_id FROM groups WHERE id = ?')
      .bind(groupId)
      .first<{ buddy_user_id: string | null }>();
    expect(row?.buddy_user_id).toBeNull();
  });
});

describe('the task clock', () => {
  it('will not start a task with no estimate', async () => {
    const { owner, groupId } = await pair('noestimate');
    const taskId = await createTask(owner, groupId);

    const res = await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    expect(res.status).toBe(400);
  });

  it('starts one, and refuses a second while it runs', async () => {
    const { owner, groupId } = await pair('onlyone');
    const first = await createTask(owner, groupId, 'Chapter one', undefined, 60);
    const second = await createTask(owner, groupId, 'Chapter two', undefined, 30);

    expect((await post(`/api/tasks/${first}/start`, {}, owner.accessToken)).status).toBe(200);
    expect((await post(`/api/tasks/${second}/start`, {}, owner.accessToken)).status).toBe(409);
  });

  /**
   * The list is where a client decides whether to offer Start, so it has to
   * carry the clock. Omitting these two columns from the projection let every
   * planned task read as already running, which hid the Start button entirely.
   */
  it('returns the estimate and the clock when listing tasks', async () => {
    const { owner, buddy, groupId } = await pair('listclock');
    const taskId = await createTask(owner, groupId, 'Problem set', undefined, 90);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);

    type Listed = { id: string; estimatedMinutes: number | null; startedAt: string | null };
    const listed = async (session: Session, query: string) => {
      const { tasks } = (await (await get(`/api/tasks?${query}`, session.accessToken)).json()) as {
        tasks: Listed[];
      };
      return tasks.find((t) => t.id === taskId);
    };

    expect(await listed(owner, 'scope=mine')).toMatchObject({ estimatedMinutes: 90 });
    expect((await listed(owner, 'scope=mine'))?.startedAt).toEqual(expect.any(String));

    // And on the group board, which is what the buddy's screen reads.
    expect(await listed(buddy, `scope=all&groupId=${groupId}`)).toMatchObject({
      estimatedMinutes: 90,
    });
    expect((await listed(buddy, `scope=all&groupId=${groupId}`))?.startedAt).toEqual(
      expect.any(String),
    );
  });

  it('reports a task that has not started as not running', async () => {
    const { owner, groupId } = await pair('notstarted');
    const taskId = await createTask(owner, groupId, 'Later', undefined, 30);

    const { tasks } = (await (await get('/api/tasks?scope=mine', owner.accessToken)).json()) as {
      tasks: { id: string; startedAt: string | null }[];
    };
    expect(tasks.find((t) => t.id === taskId)?.startedAt).toBeNull();
  });

  it('stops the clock when the task is finished', async () => {
    const { owner, groupId } = await pair('donestops');
    const taskId = await createTask(owner, groupId, 'Essay', undefined, 45);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    await markDone(owner, taskId);

    const row = await env.DB.prepare('SELECT started_at FROM tasks WHERE id = ?')
      .bind(taskId)
      .first<{ started_at: string | null }>();
    expect(row?.started_at).toBeNull();
  });
});

describe('abandoning', () => {
  /** Gives a user credits to lose, without going through a review. */
  async function grant(userId: string, amount: number) {
    await env.DB.prepare(
      "INSERT INTO credit_ledger (id, user_id, amount, reason, ref_type, ref_id) VALUES (?,?,?,'admin_adjust','test',?)",
    )
      .bind(crypto.randomUUID(), userId, amount, crypto.randomUUID())
      .run();
    await env.DB.prepare('UPDATE user_stats SET total_credits = total_credits + ? WHERE user_id = ?')
      .bind(amount, userId)
      .run();
  }

  it('deducts ten points and frees the user', async () => {
    const { owner, groupId } = await pair('abandon');
    await grant(owner.userId, 100);

    const taskId = await createTask(owner, groupId, 'Long read', undefined, 120);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);

    const res = await post(`/api/tasks/${taskId}/abandon`, {}, owner.accessToken);
    expect(res.status).toBe(200);
    expect((await res.json() as { credits: number }).credits).toBe(-10);

    expect((await statsFor(owner.userId)).total_credits).toBe(90);
  });

  it('never takes someone below zero', async () => {
    const { owner, groupId } = await pair('nodebt');
    const taskId = await createTask(owner, groupId, 'First ever', undefined, 30);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    await post(`/api/tasks/${taskId}/abandon`, {}, owner.accessToken);

    expect((await statsFor(owner.userId)).total_credits).toBe(0);
  });

  it('charges again when the same task is restarted and dropped', async () => {
    // The ledger's unique (user, reason, ref_type, ref_id) index would make this
    // a once-per-task penalty if the key were the task id alone. Each start is
    // its own commitment, so each start is its own key.
    const { owner, groupId } = await pair('twice');
    await grant(owner.userId, 100);
    const taskId = await createTask(owner, groupId, 'On and off', undefined, 30);

    for (let i = 0; i < 2; i += 1) {
      await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
      const res = await post(`/api/tasks/${taskId}/abandon`, {}, owner.accessToken);
      expect(res.status, `attempt ${i + 1}`).toBe(200);
    }

    expect((await statsFor(owner.userId)).total_credits).toBe(80);
  });

  it('refuses to abandon a task that is not running', async () => {
    const { owner, groupId } = await pair('notrunning');
    const taskId = await createTask(owner, groupId, 'Idle', undefined, 30);
    expect((await post(`/api/tasks/${taskId}/abandon`, {}, owner.accessToken)).status).toBe(409);
  });
});

describe('a task that runs past its own day', () => {
  it('is swept without charging, and the chat lock lifts with it', async () => {
    // The day ending is not the same as walking away. Someone who started a
    // task and fell asleep should wake up free, not fined — and above all not
    // still locked out of their group chat.
    const { owner, groupId } = await pair('overnight');
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    const taskId = await createTask(owner, groupId, 'Late night', undefined, 60);
    await post(`/api/tasks/${taskId}/start`, {}, owner.accessToken);
    // Backdate it so the rollover treats it as yesterday's.
    await env.DB.prepare('UPDATE tasks SET due_date = ? WHERE id = ?')
      .bind(yesterday, taskId)
      .run();

    const { runRollover } = await import('../src/jobs/rollover.js');
    const { db } = await import('../src/db/client.js');
    await runRollover(db(env.DB));

    const row = await env.DB.prepare('SELECT status, started_at FROM tasks WHERE id = ?')
      .bind(taskId)
      .first<{ status: string; started_at: string | null }>();
    expect(row?.status).toBe('missed');
    expect(row?.started_at).toBeNull();

    // Nothing was deducted.
    expect((await statsFor(owner.userId)).total_credits).toBe(0);

    // And the clock is free again for a new task.
    const next = await createTask(owner, groupId, 'Fresh start', undefined, 30);
    expect((await post(`/api/tasks/${next}/start`, {}, owner.accessToken)).status).toBe(200);
  });
});

describe('the review queue', () => {
  it('only lists tasks this caller may actually review', async () => {
    // Offering a review that will be refused is worse than not offering it, so
    // the queue applies the same rule the review endpoint enforces.
    const { owner, buddy, groupId } = await pair('queuerule');
    const third = await addMember(owner, groupId, 'qr-third@example.com', 'qrthird');
    await put(`/api/groups/${groupId}/buddy`, { buddyUserId: buddy.userId }, owner.accessToken);

    const taskId = await createTask(owner, groupId, 'Needs a look');
    await markDone(owner, taskId);

    const forBuddy = (await (
      await get('/api/tasks?scope=review', buddy.accessToken)
    ).json()) as { tasks: { id: string }[] };
    const forThird = (await (
      await get('/api/tasks?scope=review', third.accessToken)
    ).json()) as { tasks: { id: string }[] };

    expect(forBuddy.tasks.map((t) => t.id)).toContain(taskId);
    expect(forThird.tasks.map((t) => t.id)).not.toContain(taskId);
  });

  it('still lists everything when no Buddy is named', async () => {
    const { owner, buddy, groupId } = await pair('queuenobuddy');
    const taskId = await createTask(owner, groupId, 'Open to anyone');
    await markDone(owner, taskId);

    const queue = (await (
      await get('/api/tasks?scope=review', buddy.accessToken)
    ).json()) as { tasks: { id: string }[] };
    expect(queue.tasks.map((t) => t.id)).toContain(taskId);
  });
});
