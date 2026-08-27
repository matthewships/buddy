import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createTask,
  del,
  get,
  pair,
  patch,
  post,
  resetRateLimits,
  statsFor,
  today,
} from './helpers.js';

beforeEach(resetRateLimits);

describe('planning tasks', () => {
  it('creates a task for today', async () => {
    const { owner, groupId } = await pair('plan');
    const id = await createTask(owner, groupId, 'Write 500 words');

    const { tasks } = (await (await get(`/api/tasks?date=${today()}`, owner.accessToken)).json()) as {
      tasks: { id: string; title: string; status: string }[];
    };
    expect(tasks.find((t) => t.id === id)).toMatchObject({
      title: 'Write 500 words',
      status: 'planned',
    });
  });

  it('refuses to plan into a day that has already passed', async () => {
    const { owner, groupId } = await pair('past');
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const res = await post(
      '/api/tasks',
      { groupId, title: 'Too late', dueDate: yesterday },
      owner.accessToken,
    );
    expect(res.status).toBe(400);
  });

  it('refuses to create a task in a group you are not in', async () => {
    const { owner, groupId } = await pair('outsider-a');
    const other = await pair('outsider-b');
    const res = await post(
      '/api/tasks',
      { groupId, title: 'Not mine', dueDate: today() },
      other.owner.accessToken,
    );
    expect(res.status).toBe(403);
    expect(owner.userId).toBeTruthy();
  });

  it('lets the owner edit and delete while planned, and not after', async () => {
    const { owner, buddy, groupId } = await pair('edit');
    const id = await createTask(owner, groupId);

    const edited = await patch('/api/tasks/' + id, { title: 'Read 40 pages' }, owner.accessToken);
    expect(edited.status).toBe(200);

    // Someone else cannot edit it.
    expect((await patch('/api/tasks/' + id, { title: 'Hah' }, buddy.accessToken)).status).toBe(403);

    // Once submitted, edits are refused — update the proof instead.
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
    expect((await patch('/api/tasks/' + id, { title: 'Sneaky' }, owner.accessToken)).status).toBe(409);
  });

  it('will not delete an approved task', async () => {
    const { owner, buddy, groupId } = await pair('nodelete');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${id}/review`, { action: 'approve', rating: 3 }, buddy.accessToken);

    expect((await del(`/api/tasks/${id}`, owner.accessToken)).status).toBe(409);
  });
});

describe('the review loop', () => {
  it('approves with a rating and pays rating x 10 plus the daily bonus', async () => {
    const { owner, buddy, groupId } = await pair('approve');
    const id = await createTask(owner, groupId);

    await post(`/api/tasks/${id}/done`, { proofText: 'Read chapters 1-2' }, owner.accessToken);

    const res = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 4, comment: 'Nice' },
      buddy.accessToken,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      task: { status: string };
      award: { credits: number; dailyBonus: number; streak: number };
    };

    expect(body.task.status).toBe('approved');
    expect(body.award.credits).toBe(40);
    // It was the only task for the day, so the day is complete.
    expect(body.award.dailyBonus).toBe(20);

    const stats = await statsFor(owner.userId);
    expect(stats.total_credits).toBe(60);
    expect(stats.tasks_approved).toBe(1);
    expect(stats.current_streak).toBe(1);

    // The reviewer's tally moves too.
    expect((await statsFor(buddy.userId)).reviews_given).toBe(1);
  });

  it('treats a 0 rating as an approval that earns nothing', async () => {
    const { owner, buddy, groupId } = await pair('zero');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);

    const res = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 0 },
      buddy.accessToken,
    );
    const body = (await res.json()) as { task: { status: string }; award: { credits: number } };

    // Closes the task — there is no rejected state — but pays nothing.
    expect(body.task.status).toBe('approved');
    expect(body.award.credits).toBe(0);
    const stats = await statsFor(owner.userId);
    expect(stats.total_credits).toBe(20); // the daily bonus only
    expect(stats.tasks_approved).toBe(1);
  });

  it('sends a task back for proof and accepts it again', async () => {
    const { owner, buddy, groupId } = await pair('proof');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);

    const sentBack = await post(
      `/api/tasks/${id}/review`,
      { action: 'request_proof', comment: 'What did you actually read?' },
      buddy.accessToken,
    );
    await expect(sentBack.json()).resolves.toMatchObject({
      task: { status: 'proof_requested' },
    });

    // Proof has to say something.
    expect((await post(`/api/tasks/${id}/proof`, {}, owner.accessToken)).status).toBe(400);

    const withProof = await post(
      `/api/tasks/${id}/proof`,
      { proofText: 'Chapters 1-2, notes in Notion' },
      owner.accessToken,
    );
    await expect(withProof.json()).resolves.toMatchObject({ task: { status: 'done' } });

    const approved = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 5 },
      buddy.accessToken,
    );
    await expect(approved.json()).resolves.toMatchObject({ task: { status: 'approved' } });

    const history = (await (await get(`/api/tasks/${id}/reviews`, owner.accessToken)).json()) as {
      reviews: { action: string; rating: number | null }[];
    };
    expect(history.reviews.map((r) => r.action)).toEqual(['request_proof', 'approve']);
  });

  it('refuses to let the owner review their own task', async () => {
    const { owner, groupId } = await pair('self');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);

    const res = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 5 },
      owner.accessToken,
    );
    expect(res.status).toBe(403);
  });

  it('refuses a review from outside the group', async () => {
    const a = await pair('rev-in');
    const b = await pair('rev-out');
    const id = await createTask(a.owner, a.groupId);
    await post(`/api/tasks/${id}/done`, {}, a.owner.accessToken);

    const res = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 5 },
      b.buddy.accessToken,
    );
    expect(res.status).toBe(403);
  });

  it('will not review a task that is not waiting for one', async () => {
    const { owner, buddy, groupId } = await pair('notdone');
    const id = await createTask(owner, groupId);
    // Still `planned`.
    const res = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 5 },
      buddy.accessToken,
    );
    expect(res.status).toBe(409);
  });

  it('makes the first review final under concurrency, and pays exactly once', async () => {
    const { owner, buddy, groupId } = await pair('race');

    // A third member, so two different people can review simultaneously.
    const third = await pair('racethird');
    await post(
      `/api/groups/${groupId}/invites`,
      { handle: third.ownerHandle },
      owner.accessToken,
    );
    const { invites } = (await (await get('/api/invites', third.owner.accessToken)).json()) as {
      invites: { id: string }[];
    };
    await post(`/api/invites/${invites[0]!.id}/accept`, {}, third.owner.accessToken);

    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);

    // Both fire at once; the guarded UPDATE decides.
    const [a, b] = await Promise.all([
      post(`/api/tasks/${id}/review`, { action: 'approve', rating: 5 }, buddy.accessToken),
      post(`/api/tasks/${id}/review`, { action: 'approve', rating: 2 }, third.owner.accessToken),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Exactly one ledger row for this task, so nobody was paid twice.
    const { results } = await env.DB.prepare(
      "SELECT count(*) AS n FROM credit_ledger WHERE ref_type = 'task' AND ref_id = ?",
    )
      .bind(id)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(1);

    // And exactly one review row.
    const reviews = await env.DB.prepare('SELECT count(*) AS n FROM task_reviews WHERE task_id = ?')
      .bind(id)
      .all<{ n: number }>();
    expect(reviews.results[0]?.n).toBe(1);
  });
});

describe('the daily bonus', () => {
  it('is withheld until every task for the day is approved', async () => {
    const { owner, buddy, groupId } = await pair('bonus');
    const first = await createTask(owner, groupId, 'Task one');
    const second = await createTask(owner, groupId, 'Task two');

    await post(`/api/tasks/${first}/done`, {}, owner.accessToken);
    const one = await post(
      `/api/tasks/${first}/review`,
      { action: 'approve', rating: 3 },
      buddy.accessToken,
    );
    await expect(one.json()).resolves.toMatchObject({ award: { dailyBonus: 0 } });
    expect((await statsFor(owner.userId)).total_credits).toBe(30);

    await post(`/api/tasks/${second}/done`, {}, owner.accessToken);
    const two = await post(
      `/api/tasks/${second}/review`,
      { action: 'approve', rating: 3 },
      buddy.accessToken,
    );
    await expect(two.json()).resolves.toMatchObject({ award: { dailyBonus: 20 } });
    expect((await statsFor(owner.userId)).total_credits).toBe(80); // 30 + 30 + 20
  });

  it('is paid only once per day even as more approvals land', async () => {
    const { owner, buddy, groupId } = await pair('bonus-once');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${id}/review`, { action: 'approve', rating: 1 }, buddy.accessToken);

    // A second task added and approved on the same day must not re-pay the bonus.
    const second = await createTask(owner, groupId, 'Another');
    await post(`/api/tasks/${second}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${second}/review`, { action: 'approve', rating: 1 }, buddy.accessToken);

    const { results } = await env.DB.prepare(
      "SELECT count(*) AS n FROM credit_ledger WHERE user_id = ? AND reason = 'daily_bonus'",
    )
      .bind(owner.userId)
      .all<{ n: number }>();
    expect(results[0]?.n).toBe(1);
    expect((await statsFor(owner.userId)).total_credits).toBe(10 + 10 + 20);
  });
});

describe('badges', () => {
  it('awards the first-approved badge on the first approval', async () => {
    const { owner, buddy, groupId, ownerHandle } = await pair('badge');
    const id = await createTask(owner, groupId);
    await post(`/api/tasks/${id}/done`, {}, owner.accessToken);

    const res = await post(
      `/api/tasks/${id}/review`,
      { action: 'approve', rating: 5 },
      buddy.accessToken,
    );
    const body = (await res.json()) as { award: { badges: string[] } };
    expect(body.award.badges).toContain('first_approved');

    const profile = (await (await get(`/api/users/${ownerHandle}`, buddy.accessToken)).json()) as {
      badges: { key: string }[];
    };
    expect(profile.badges.map((b) => b.key)).toContain('first_approved');
  });
});

describe('the review queue', () => {
  it('lists buddies tasks awaiting review across groups, and not my own', async () => {
    const { owner, buddy, groupId, buddyHandle } = await pair('queue');
    const mine = await createTask(owner, groupId, 'My task');
    const theirs = await createTask(buddy, groupId, 'Their task');

    await post(`/api/tasks/${mine}/done`, {}, owner.accessToken);
    await post(`/api/tasks/${theirs}/done`, {}, buddy.accessToken);

    const { tasks } = (await (
      await get('/api/tasks?scope=review', owner.accessToken)
    ).json()) as { tasks: { id: string; ownerHandle: string }[] };

    expect(tasks.map((t) => t.id)).toContain(theirs);
    expect(tasks.map((t) => t.id)).not.toContain(mine);
    expect(tasks[0]?.ownerHandle).toBe(buddyHandle);
  });
});
