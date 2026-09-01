import { beforeEach, describe, expect, it } from 'vitest';

import { get, onboard, patch, resetRateLimits, signUp, type Session } from './helpers.js';

beforeEach(resetRateLimits);

interface Me {
  goalKey: string | null;
  goalKey2: string | null;
  goalKeys: string[];
  goalText: string | null;
  interests: string[];
  interestText: string | null;
}

async function me(session: Session): Promise<Me> {
  const res = await get('/api/me', session.accessToken);
  expect(res.status).toBe(200);
  return res.json();
}

/**
 * Goals are stored twice on purpose (§2.1): the ordered list the web picker
 * collects, and the indexed `goal_key`/`goal_key_2` pair that matching, the
 * directory filter and the mobile app read. These tests are about the one rule
 * that keeps them from disagreeing — whichever shape a patch arrives in, the
 * route writes both.
 */
describe('the goal list', () => {
  it('stores more goals than the indexed pair, in pick order', async () => {
    const session = await signUp('goals-many@example.com');
    await onboard(session, 'goalsmany');

    const res = await patch(
      '/api/me',
      { goalKeys: ['fitness', 'thesis', 'coding', 'reading'] },
      session.accessToken,
    );
    expect(res.status).toBe(200);

    const profile = await me(session);
    expect(profile.goalKeys).toEqual(['fitness', 'thesis', 'coding', 'reading']);
    // The first two, and only the first two, reach the indexed columns.
    expect(profile.goalKey).toBe('fitness');
    expect(profile.goalKey2).toBe('thesis');
  });

  it('derives the list from the pair when a two-goal client patches', async () => {
    const session = await signUp('goals-pair@example.com');
    await onboard(session, 'goalspair');
    await patch('/api/me', { goalKeys: ['fitness', 'thesis', 'coding'] }, session.accessToken);

    // What the mobile app sends: it has no concept of the list.
    const res = await patch(
      '/api/me',
      { goalKey: 'sat', goalKey2: 'language' },
      session.accessToken,
    );
    expect(res.status).toBe(200);

    const profile = await me(session);
    // The extras are dropped rather than merged back: a two-goal client saying
    // "these are my goals" is answering the whole question.
    expect(profile.goalKeys).toEqual(['sat', 'language']);
    expect(profile.goalKey).toBe('sat');
    expect(profile.goalKey2).toBe('language');
  });

  it('lets a shorter list clear the second indexed goal', async () => {
    const session = await signUp('goals-shrink@example.com');
    await onboard(session, 'goalsshrink');
    await patch('/api/me', { goalKeys: ['fitness', 'thesis'] }, session.accessToken);

    await patch('/api/me', { goalKeys: ['coding'] }, session.accessToken);
    const profile = await me(session);
    expect(profile.goalKeys).toEqual(['coding']);
    expect(profile.goalKey).toBe('coding');
    expect(profile.goalKey2).toBeNull();
  });

  it('reads back as the pair for an account that predates the list', async () => {
    const session = await signUp('goals-legacy@example.com');
    // `onboard` sends the pair shape, which is what every account created
    // before the column had.
    await onboard(session, 'goalslegacy', { goalKey: 'thesis', goalKey2: 'fitness' });

    const profile = await me(session);
    expect(profile.goalKeys).toEqual(['thesis', 'fitness']);
  });

  it('requires goal text when custom is anywhere in the list', async () => {
    const session = await signUp('goals-custom@example.com');
    await onboard(session, 'goalscustom');

    const rejected = await patch(
      '/api/me',
      { goalKeys: ['thesis', 'custom'] },
      session.accessToken,
    );
    expect(rejected.status).toBe(400);

    const accepted = await patch(
      '/api/me',
      { goalKeys: ['thesis', 'custom'], goalText: 'Learn to sail' },
      session.accessToken,
    );
    expect(accepted.status).toBe(200);
    expect((await me(session)).goalText).toBe('Learn to sail');
  });

  it('rejects a goal key that is not in the list', async () => {
    const session = await signUp('goals-bogus@example.com');
    await onboard(session, 'goalsbogus');

    const res = await patch('/api/me', { goalKeys: ['become_a_wizard'] }, session.accessToken);
    expect(res.status).toBe(400);
  });
});

/** The `Other` hobby, which is the only interest anyone writes themselves. */
describe('the custom interest', () => {
  it('stores the text beside the chip', async () => {
    const session = await signUp('hobby-custom@example.com');
    await onboard(session, 'hobbycustom');

    const res = await patch(
      '/api/me',
      { interests: ['tennis', 'custom'], interestText: 'Falconry' },
      session.accessToken,
    );
    expect(res.status).toBe(200);

    const profile = await me(session);
    expect(profile.interests.sort()).toEqual(['custom', 'tennis']);
    expect(profile.interestText).toBe('Falconry');
  });

  it('refuses the chip with no text behind it', async () => {
    const session = await signUp('hobby-empty@example.com');
    await onboard(session, 'hobbyempty');

    const res = await patch('/api/me', { interests: ['custom'] }, session.accessToken);
    expect(res.status).toBe(400);
  });

  it('accepts tennis, which is a plain list addition', async () => {
    const session = await signUp('hobby-tennis@example.com');
    await onboard(session, 'hobbytennis');

    const res = await patch('/api/me', { interests: ['tennis'] }, session.accessToken);
    expect(res.status).toBe(200);
    expect((await me(session)).interests).toEqual(['tennis']);
  });
});
