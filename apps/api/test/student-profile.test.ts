import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { MATCH_SCORE } from '../src/services/matching.js';

import {
  get,
  onboard,
  patch,
  post,
  resetRateLimits,
  signUp,
  type Session,
} from './helpers.js';

beforeEach(resetRateLimits);

async function student(
  email: string,
  handle: string,
  extra: Record<string, unknown> = {},
): Promise<Session> {
  const session = await signUp(email);
  await onboard(session, handle, { isOpenBuddy: true, ...extra });
  return session;
}

async function directory(session: Session, query = ''): Promise<{
  buddies: Record<string, unknown>[];
  nextCursor: string | null;
}> {
  const res = await get(`/api/buddies${query}`, session.accessToken);
  expect(res.status).toBe(200);
  return res.json();
}

/**
 * The full directory in order, walked page by page.
 *
 * Ordering assertions cannot read one page: every test in this file shares one
 * database, so by the time a late test runs, the people it created may sit past
 * the first page. The keyset cursor guarantees the concatenation is the true
 * global order, which is exactly what these tests want to assert about.
 */
async function fullOrder(session: Session, query = '?limit=20'): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 200; guard += 1) {
    const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page = await directory(session, `${query}${suffix}`);
    seen.push(...page.buddies.map((b) => b.handle as string));
    cursor = page.nextCursor;
    if (!cursor) return seen;
  }
  throw new Error('paging did not terminate');
}

/**
 * One buddy's card, found however deep in the listing it sits — same reason as
 * `fullOrder`: this file's tests share a database and a card can page away.
 */
async function findCard(session: Session, handle: string): Promise<Record<string, unknown>> {
  let cursor: string | null = null;
  for (let guard = 0; guard < 200; guard += 1) {
    const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page = await directory(session, `?limit=20${suffix}`);
    const found = page.buddies.find((b) => b.handle === handle);
    if (found) return found;
    cursor = page.nextCursor;
    if (!cursor) throw new Error(`${handle} is not in the directory`);
  }
  throw new Error('paging did not terminate');
}

/**
 * The migration is only really proven here: this suite runs in workerd against
 * real D1, so a CHECK constraint that SQLite would reject fails the test rather
 * than the deploy.
 */
describe('student profile columns', () => {
  it('stores and returns every field', async () => {
    const me = await signUp('sp-store@example.com');
    const res = await patch(
      '/api/me',
      {
        handle: 'spstore',
        goalKey: 'thesis',
        educationLevel: 'masters',
        institution: 'University of Toronto',
        city: 'Toronto',
        majorKey: 'computer_science',
        country: 'CA',
        bio: 'Thesis by spring.',
        topics: ['ai', 'space'],
        interests: ['running'],
      },
      me.accessToken,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.educationLevel).toBe('masters');
    expect(body.institution).toBe('University of Toronto');
    expect(body.majorKey).toBe('computer_science');
    expect(body.country).toBe('CA');
    expect(body.bio).toBe('Thesis by spring.');
    expect(body.topics).toEqual(expect.arrayContaining(['ai', 'space']));
    expect(body.interests).toEqual(['running']);
  });

  /**
   * The values that the pre-0009 CHECK constraints would have rejected outright
   * with a SQLITE_CONSTRAINT error. This is the test that says the widening
   * actually reached the database rather than only the TypeScript enums.
   */
  it('stores a level and subject that the frozen CHECKs forbid', async () => {
    const me = await signUp('sp-widened@example.com');
    const res = await patch(
      '/api/me',
      { handle: 'spwide', educationLevel: 'middle_school', majorKey: 'geography' },
      me.accessToken,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.educationLevel).toBe('middle_school');
    expect(body.majorKey).toBe('geography');
    // Middle school still has to derive a legacy occupation the old CHECK
    // allows, or the same write would fail one column later.
    expect(body.occupationKey).toBe('student_high_school');
  });

  it('accepts the other subjects added for school students', async () => {
    const me = await signUp('sp-school@example.com');
    for (const majorKey of ['religious_studies', 'drama']) {
      const res = await patch('/api/me', { majorKey }, me.accessToken);
      expect(res.status).toBe(200);
      expect((await res.json() as Record<string, unknown>).majorKey).toBe(majorKey);
    }
  });

  it('rejects a level or country the database does not know', async () => {
    const me = await student('sp-bad@example.com', 'spbad');
    expect((await patch('/api/me', { educationLevel: 'kindergarten' }, me.accessToken)).status).toBe(
      400,
    );
    expect((await patch('/api/me', { country: 'ZZZ' }, me.accessToken)).status).toBe(400);
  });

  it('derives the legacy occupation from the level of study', async () => {
    // The mobile app reads occupation_key and never sends a level, so it has to
    // stay populated even though signup no longer asks the question.
    const me = await signUp('sp-derive@example.com');
    await patch(
      '/api/me',
      { handle: 'spderive', goalKey: 'thesis', educationLevel: 'high_school' },
      me.accessToken,
    );

    const row = await env.DB.prepare('SELECT occupation_key FROM users WHERE id = ?')
      .bind(me.userId)
      .first<{ occupation_key: string }>();
    expect(row?.occupation_key).toBe('student_high_school');
  });

  it('lets an explicit occupation win over the derived one', async () => {
    const me = await signUp('sp-explicit@example.com');
    await patch(
      '/api/me',
      {
        handle: 'spexplicit',
        goalKey: 'thesis',
        educationLevel: 'phd',
        occupationKey: 'employee',
      },
      me.accessToken,
    );

    const row = await env.DB.prepare('SELECT occupation_key FROM users WHERE id = ?')
      .bind(me.userId)
      .first<{ occupation_key: string }>();
    expect(row?.occupation_key).toBe('employee');
  });

  it('stores the normalised institution beside the raw one', async () => {
    const me = await student('sp-norm@example.com', 'spnorm', { institution: 'M.I.T.' });
    const row = await env.DB.prepare(
      'SELECT institution, institution_normalised FROM users WHERE id = ?',
    )
      .bind(me.userId)
      .first<{ institution: string; institution_normalised: string }>();

    // Raw text is what gets displayed; the normalised form is what matches.
    expect(row?.institution).toBe('M.I.T.');
    expect(row?.institution_normalised).toBe('mit');
  });

  it('clears the normalised form when the institution is cleared', async () => {
    const me = await student('sp-clear@example.com', 'spclear', { institution: 'MIT' });
    await patch('/api/me', { institution: null }, me.accessToken);

    const row = await env.DB.prepare(
      'SELECT institution, institution_normalised FROM users WHERE id = ?',
    )
      .bind(me.userId)
      .first<{ institution: string | null; institution_normalised: string | null }>();
    expect(row?.institution).toBeNull();
    expect(row?.institution_normalised).toBeNull();
  });
});

describe('tags', () => {
  it('replaces a set rather than merging into it', async () => {
    const me = await student('tag-replace@example.com', 'tagreplace', {
      topics: ['ai', 'space'],
    });

    await patch('/api/me', { topics: ['history'] }, me.accessToken);
    const body = (await (await get('/api/me', me.accessToken)).json()) as { topics: string[] };
    expect(body.topics).toEqual(['history']);
  });

  it('leaves the other kind alone', async () => {
    const me = await student('tag-kinds@example.com', 'tagkinds', {
      topics: ['ai'],
      interests: ['running', 'coffee'],
    });

    await patch('/api/me', { topics: ['space'] }, me.accessToken);
    const body = (await (await get('/api/me', me.accessToken)).json()) as {
      topics: string[];
      interests: string[];
    };
    expect(body.topics).toEqual(['space']);
    expect(body.interests).toEqual(expect.arrayContaining(['running', 'coffee']));
  });

  it('leaves tags untouched when the patch does not mention them', async () => {
    const me = await student('tag-omit@example.com', 'tagomit', { topics: ['ai'] });
    await patch('/api/me', { bio: 'Changed my mind about nothing.' }, me.accessToken);

    const body = (await (await get('/api/me', me.accessToken)).json()) as { topics: string[] };
    expect(body.topics).toEqual(['ai']);
  });

  it('empties a set when sent an empty array', async () => {
    const me = await student('tag-empty@example.com', 'tagempty', { topics: ['ai'] });
    await patch('/api/me', { topics: [] }, me.accessToken);

    const body = (await (await get('/api/me', me.accessToken)).json()) as { topics: string[] };
    expect(body.topics).toEqual([]);
  });

  it('cannot store the same tag twice', async () => {
    const me = await student('tag-dupe@example.com', 'tagdupe', { topics: ['ai', 'ai'] });
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user_tags WHERE user_id = ? AND kind = 'topic'",
    )
      .bind(me.userId)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('goes away with the account', async () => {
    const me = await student('tag-cascade@example.com', 'tagcascade', { topics: ['ai'] });
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(me.userId).run();

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_tags WHERE user_id = ?')
      .bind(me.userId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

describe('onboarding completion', () => {
  it('completes for a web signup, whose handle was claimed at registration', async () => {
    // The web client sends no handle in the completing patch, because it asked
    // for one on the register screen. Requiring one there would strand it.
    const session = await signUp('onb-web@example.com', 'correct-horse-battery', 'Web Signup', {
      handle: 'onbweb',
    });
    const body = (await (
      await patch(
        '/api/me',
        { goalKey: 'thesis', educationLevel: 'undergraduate' },
        session.accessToken,
      )
    ).json()) as { onboarded: boolean; handle: string };

    expect(body.handle).toBe('onbweb');
    expect(body.onboarded).toBe(true);
  });

  it('completes for a mobile signup, which sends a handle and an occupation but no level', async () => {
    const session = await signUp('onb-mobile@example.com');
    const body = (await (
      await patch(
        '/api/me',
        { handle: 'onbmobile', goalKey: 'thesis', occupationKey: 'student_grad' },
        session.accessToken,
      )
    ).json()) as { onboarded: boolean };

    expect(body.onboarded).toBe(true);
  });

  it('does not complete while the handle is still the registration placeholder', async () => {
    const session = await signUp('onb-placeholder@example.com');
    const body = (await (
      await patch('/api/me', { goalKey: 'thesis', educationLevel: 'masters' }, session.accessToken)
    ).json()) as { onboarded: boolean };

    expect(body.onboarded).toBe(false);
  });
});

describe('register with a handle', () => {
  it('claims the handle at registration', async () => {
    const res = await post('/api/auth/register', {
      email: 'reg-handle@example.com',
      password: 'correct-horse-battery',
      displayName: 'Handle Claimer',
      handle: 'regclaimed',
    });
    expect(res.status).toBe(201);

    const row = await env.DB.prepare('SELECT handle FROM users WHERE email = ?')
      .bind('reg-handle@example.com')
      .first<{ handle: string }>();
    expect(row?.handle).toBe('regclaimed');
  });

  it('rejects one that is already taken', async () => {
    await student('reg-taken-a@example.com', 'regtaken');
    const res = await post('/api/auth/register', {
      email: 'reg-taken-b@example.com',
      password: 'correct-horse-battery',
      displayName: 'Latecomer',
      handle: 'regtaken',
    });
    expect(res.status).toBe(409);
  });

  it('still accepts a registration without one', async () => {
    const res = await post('/api/auth/register', {
      email: 'reg-nohandle@example.com',
      password: 'correct-horse-battery',
      displayName: 'Mobile Signup',
    });
    expect(res.status).toBe(201);
  });
});

describe('directory filters', () => {
  it('filters by level, major, country and topic', async () => {
    const me = await student('f-me@example.com', 'fme');
    await student('f-match@example.com', 'fmatch', {
      educationLevel: 'phd',
      majorKey: 'physics',
      country: 'DE',
      topics: ['space'],
    });
    await student('f-other@example.com', 'fother', {
      educationLevel: 'high_school',
      majorKey: 'law',
      country: 'BR',
      topics: ['music'],
    });

    for (const query of [
      '?level=phd',
      '?major=physics',
      '?country=DE',
      '?topic=space',
      '?level=phd&major=physics&country=DE&topic=space',
    ]) {
      const { buddies } = await directory(me, query);
      const handles = buddies.map((b) => b.handle);
      expect(handles, query).toContain('fmatch');
      expect(handles, query).not.toContain('fother');
    }
  });

  it('matches the same institution however it was typed', async () => {
    const me = await student('f-inst-me@example.com', 'finstme', { institution: 'MIT' });
    await student('f-inst-them@example.com', 'finstthem', { institution: 'm.i.t.' });
    await student('f-inst-else@example.com', 'finstelse', { institution: 'Caltech' });

    const { buddies } = await directory(me, '?sameInstitution=true');
    const handles = buddies.map((b) => b.handle);
    expect(handles).toContain('finstthem');
    expect(handles).not.toContain('finstelse');
  });

  it('matches nobody when the viewer has no institution', async () => {
    const me = await student('f-noinst@example.com', 'fnoinst');
    await student('f-hasinst@example.com', 'fhasinst', { institution: 'MIT' });

    const { buddies } = await directory(me, '?sameInstitution=true');
    expect(buddies).toHaveLength(0);
  });

  it('returns the card fields the directory renders', async () => {
    const me = await student('f-card-me@example.com', 'fcardme');
    await student('f-card-them@example.com', 'fcardthem', {
      educationLevel: 'undergraduate',
      institution: 'Leeds',
      majorKey: 'design',
      country: 'GB',
      topics: ['art', 'film'],
      interests: ['baking'],
    });

    const them = await findCard(me, 'fcardthem');
    expect(them.educationLevel).toBe('undergraduate');
    expect(them.institution).toBe('Leeds');
    expect(them.majorKey).toBe('design');
    expect(them.country).toBe('GB');
    expect(them.topics).toEqual(expect.arrayContaining(['art', 'film']));
    expect(them.interests).toEqual(['baking']);
  });

  it('gives a buddy with no tags an empty array, not null', async () => {
    const me = await student('f-notags-me@example.com', 'fnotagsme');
    await student('f-notags-them@example.com', 'fnotagsthem');

    const them = await findCard(me, 'fnotagsthem');
    expect(them.topics).toEqual([]);
    expect(them.interests).toEqual([]);
  });
});

describe('directory sorting', () => {
  it('ranks the same institution above the same major', async () => {
    const me = await student('s-me@example.com', 'sme', {
      goalKey: 'coding',
      institution: 'Imperial',
      majorKey: 'physics',
    });
    await student('s-inst@example.com', 'sinst', { goalKey: 'reading', institution: 'Imperial' });
    await student('s-major@example.com', 'smajor', { goalKey: 'reading', majorKey: 'physics' });

    const order = await fullOrder(me);
    expect(order.indexOf('sinst')).toBeLessThan(order.indexOf('smajor'));
  });

  it('keeps a shared goal above every other signal combined', async () => {
    // The weights are ordinal, and this is the property that makes them so: a
    // pile of soft matches must never outrank the thing the product is about.
    const everythingElse =
      MATCH_SCORE.sameInstitution +
      MATCH_SCORE.sameMajor +
      MATCH_SCORE.sameOccupation +
      MATCH_SCORE.sameLevel +
      MATCH_SCORE.sharedTopic +
      MATCH_SCORE.sameCountry +
      MATCH_SCORE.activeNow;
    expect(MATCH_SCORE.sameGoal).toBeGreaterThan(everythingElse);

    const me = await student('s-goal-me@example.com', 'sgoalme', {
      goalKey: 'thesis',
      institution: 'Imperial',
      majorKey: 'physics',
      educationLevel: 'phd',
      occupationKey: 'student_grad',
      country: 'GB',
      topics: ['space'],
    });
    // Shares the goal and nothing else.
    await student('s-goal-only@example.com', 'sgoalonly', {
      goalKey: 'thesis',
      occupationKey: 'employee',
    });
    // Shares everything except the goal.
    await student('s-everything-else@example.com', 'selse', {
      goalKey: 'reading',
      institution: 'Imperial',
      majorKey: 'physics',
      educationLevel: 'phd',
      occupationKey: 'student_grad',
      country: 'GB',
      topics: ['space'],
    });

    const order = await fullOrder(me);
    expect(order.indexOf('sgoalonly')).toBeLessThan(order.indexOf('selse'));
  });

  it('counts a shared topic once, however many overlap', async () => {
    // sameLevel (2) outweighs sharedTopic (1), so three overlapping topics must
    // still lose to one matching level — otherwise they are being summed.
    const me = await student('s-topic-me@example.com', 'stopicme', {
      goalKey: 'reading',
      occupationKey: 'employee',
      educationLevel: 'masters',
      topics: ['ai', 'space', 'music'],
    });
    await student('s-topic-many@example.com', 'stopicmany', {
      goalKey: 'fitness',
      occupationKey: 'employee',
      topics: ['ai', 'space', 'music'],
    });
    await student('s-topic-level@example.com', 'stopiclevel', {
      goalKey: 'fitness',
      occupationKey: 'employee',
      educationLevel: 'masters',
    });

    const order = await fullOrder(me);
    expect(order.indexOf('stopiclevel')).toBeLessThan(order.indexOf('stopicmany'));
  });

  it('sorts by points, highest first', async () => {
    const me = await student('p-me@example.com', 'pme');
    const rich = await student('p-rich@example.com', 'prich');
    const poor = await student('p-poor@example.com', 'ppoor');

    await env.DB.prepare('UPDATE user_stats SET total_credits = ? WHERE user_id = ?')
      .bind(500, rich.userId)
      .run();
    await env.DB.prepare('UPDATE user_stats SET total_credits = ? WHERE user_id = ?')
      .bind(10, poor.userId)
      .run();

    const order = await fullOrder(me, '?limit=20&sort=points');
    expect(order.indexOf('prich')).toBeLessThan(order.indexOf('ppoor'));
  });
});

describe('directory paging', () => {
  it('visits everyone exactly once under each sort', async () => {
    const me = await student('pg-me@example.com', 'pgme');
    for (let i = 0; i < 7; i += 1) {
      const session = await student(`pg-${i}@example.com`, `pg${i}`);
      await env.DB.prepare('UPDATE user_stats SET total_credits = ? WHERE user_id = ?')
        .bind(i * 10, session.userId)
        .run();
    }

    // Every test in this file shares one database, so the directory holds more
    // than these seven. What matters is that paging visits each row once and
    // misses none of them.
    const mine = Array.from({ length: 7 }, (_, i) => `pg${i}`);
    for (const sort of ['recommended', 'points']) {
      const seen = await fullOrder(me, `?limit=2&sort=${sort}`);
      expect(new Set(seen).size, `${sort} visited someone twice`).toBe(seen.length);
      expect(seen, `${sort} skipped someone`).toEqual(expect.arrayContaining(mine));
    }
  });

  it('restarts rather than paging on a cursor from the other sort', async () => {
    const me = await student('pg-mix-me@example.com', 'pgmixme');
    for (let i = 0; i < 4; i += 1) await student(`pg-mix-${i}@example.com`, `pgmix${i}`);

    const first = await directory(me, '?limit=2&sort=recommended');
    expect(first.nextCursor).not.toBeNull();

    // Same cursor, other sort: the position it encodes is on a different axis,
    // so continuing from it would skip or repeat people.
    const crossed = await directory(
      me,
      `?limit=2&sort=points&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    const fresh = await directory(me, '?limit=2&sort=points');
    expect(crossed.buddies.map((b) => b.handle)).toEqual(fresh.buddies.map((b) => b.handle));
  });
});

describe('the mobile-registrant-finishing-on-web path', () => {
  it('reports an unclaimed handle, so the client knows to ask for one', async () => {
    // Registered with no handle (the mobile app's shape). A client cannot work
    // this out for itself — the placeholder is derived from the user id and
    // looks like any other handle.
    const session = await signUp('loop-unclaimed@example.com');
    const me = (await (await get('/api/me', session.accessToken)).json()) as {
      handleClaimed: boolean;
    };
    expect(me.handleClaimed).toBe(false);
  });

  it('does not complete while no handle has been claimed', async () => {
    // The failure this guards: the web flow skips /register for a signed-in
    // user, so without an explicit prompt nothing ever asks for a handle. The
    // answers save, onboarding does not complete, and a client that sends the
    // user back to the questions here loops forever.
    const session = await signUp('loop-noclaim@example.com');
    const body = (await (
      await patch(
        '/api/me',
        { goalKey: 'thesis', educationLevel: 'undergraduate', institution: 'Leeds' },
        session.accessToken,
      )
    ).json()) as { onboarded: boolean };

    expect(body.onboarded).toBe(false);
  });

  it('completes once that patch carries a handle', async () => {
    const session = await signUp('loop-claims@example.com');
    const body = (await (
      await patch(
        '/api/me',
        {
          handle: 'loopclaims',
          goalKey: 'thesis',
          educationLevel: 'undergraduate',
          institution: 'Leeds',
        },
        session.accessToken,
      )
    ).json()) as { onboarded: boolean; handleClaimed: boolean; handle: string };

    expect(body.handle).toBe('loopclaims');
    expect(body.handleClaimed).toBe(true);
    expect(body.onboarded).toBe(true);
  });
});
