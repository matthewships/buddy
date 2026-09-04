import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendCodeSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@buddy/shared';

import { db } from '../db/client.js';
import { userStats, users } from '../db/schema.js';
import type { AppEnv } from '../env.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { placeholderHandle } from '../lib/handles.js';
import { newId } from '../lib/ids.js';
import { clientIp, enforceRateLimit } from '../lib/rate-limit.js';
import { nowIso } from '../lib/time.js';
import { currentUserId, requireAuth, requireSecret } from '../middleware/auth.js';
import { consumeCode, issueCode } from '../services/codes.js';
import { sendCodeEmail } from '../services/email.js';
import { assertPasswordAllowed, hashPassword, verifyPassword } from '../services/password.js';
import {
  RefreshError,
  issueSession,
  revokeAllSessions,
  revokeByToken,
  rotateSession,
} from '../services/tokens.js';

/**
 * Authentication (§4.3).
 *
 * Two principles run through every handler here:
 *
 * 1. **No account enumeration.** Registering with a taken email, logging in with
 *    a wrong password, and asking to reset an address that doesn't exist all
 *    return the same shape they would for the benign case. The only exception is
 *    handle uniqueness, which is inherently public (handles appear in the
 *    directory) and has to be checkable during onboarding.
 * 2. **Codes and passwords are rate limited before any expensive work.** PBKDF2
 *    at 600k iterations is deliberately slow, so the limiter runs first —
 *    otherwise the hash itself becomes the denial-of-service vector.
 */
export const authRoutes = new Hono<AppEnv>()

  /**
   * Creates an unverified account and emails a code. Responds identically
   * whether or not the address was already registered; if it was, the existing
   * owner gets a code and the caller learns nothing.
   */
  .post('/register', zValidator('json', registerSchema), async (c) => {
    const { email, password, displayName, handle } = c.req.valid('json');
    await enforceRateLimit(c.env.CACHE, 'register', clientIp(c.req.raw));
    assertPasswordAllowed(password);

    const client = db(c.env.DB);
    const existing = await client.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true, emailVerifiedAt: true },
    });

    if (existing) {
      // Don't reveal the collision. An unverified account gets a fresh code so
      // an abandoned signup can be resumed; a verified one gets nothing.
      if (existing.emailVerifiedAt === null) {
        const code = await issueCode(client, requireSecret(c.env), existing.id, 'verify');
        await sendCodeEmail(c.env, email, 'verify', code);
      }
      return c.json({ ok: true as const, emailSent: true as const }, 201);
    }

    // The web client asks for a handle here; the mobile app still claims one
    // later in PATCH /me. Checked before the account exists so the user is told
    // on the screen they typed it on, rather than several steps later.
    if (handle) {
      const taken = await client.query.users.findFirst({
        where: eq(users.handle, handle),
        columns: { id: true },
      });
      if (taken) throw conflict('That handle is taken', { field: 'handle' });
    }

    const { hash, salt } = await hashPassword(password);
    const userId = newId();

    // Without one, a placeholder handle keeps the NOT NULL + UNIQUE constraint
    // satisfiable before onboarding; the user picks a real one in PATCH /me.
    await client.insert(users).values({
      id: userId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      handle: handle ?? placeholderHandle(userId),
      displayName,
    });
    await client.insert(userStats).values({ userId });

    const code = await issueCode(client, requireSecret(c.env), userId, 'verify');
    await sendCodeEmail(c.env, email, 'verify', code);

    return c.json({ ok: true as const, emailSent: true as const }, 201);
  })

  /** Marks the address verified and starts a session. */
  .post('/verify-email', zValidator('json', verifyEmailSchema), async (c) => {
    const { email, code } = c.req.valid('json');
    await enforceRateLimit(c.env.CACHE, 'login', `${email}:${clientIp(c.req.raw)}`);

    const client = db(c.env.DB);
    const user = await client.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) throw badRequest('That code is no longer valid — request a new one');

    const ok = await consumeCode(client, requireSecret(c.env), user.id, 'verify', code);
    if (!ok) throw badRequest('That code is incorrect');

    if (user.emailVerifiedAt === null) {
      await client.update(users).set({ emailVerifiedAt: nowIso() }).where(eq(users.id, user.id));
    }

    const tokens = await issueSession(client, requireSecret(c.env), user.id);
    return c.json({ ...tokens, user: publicSelf({ ...user, emailVerifiedAt: nowIso() }) });
  })

  .post('/resend-code', zValidator('json', resendCodeSchema), async (c) => {
    const { email, purpose } = c.req.valid('json');
    await enforceRateLimit(c.env.CACHE, 'resendCode', email);

    const client = db(c.env.DB);
    const user = await client.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });

    if (user) {
      const code = await issueCode(client, requireSecret(c.env), user.id, purpose);
      await sendCodeEmail(c.env, email, purpose, code);
    }

    // Always 200: whether the address exists is not the caller's business.
    return c.json({ ok: true as const });
  })

  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');
    await enforceRateLimit(c.env.CACHE, 'login', `${email}:${clientIp(c.req.raw)}`);

    const client = db(c.env.DB);
    const user = await client.query.users.findFirst({ where: eq(users.email, email) });

    // One generic message for every failure mode (§4.3).
    const invalid = unauthorized('That email or password is incorrect');
    if (!user || user.deletedAt !== null) throw invalid;
    if (!(await verifyPassword(password, { hash: user.passwordHash, salt: user.passwordSalt }))) {
      throw invalid;
    }

    if (user.emailVerifiedAt === null) {
      const code = await issueCode(client, requireSecret(c.env), user.id, 'verify');
      await sendCodeEmail(c.env, email, 'verify', code);
      return c.json({ verificationRequired: true as const, email }, 403);
    }

    const tokens = await issueSession(client, requireSecret(c.env), user.id);
    return c.json({ ...tokens, user: publicSelf(user) });
  })

  .post('/refresh', zValidator('json', refreshSchema), async (c) => {
    try {
      const tokens = await rotateSession(
        db(c.env.DB),
        requireSecret(c.env),
        c.req.valid('json').refreshToken,
      );
      return c.json(tokens);
    } catch (error) {
      if (error instanceof RefreshError) {
        throw unauthorized('Your session expired — sign in again');
      }
      throw error;
    }
  })

  .post('/logout', zValidator('json', refreshSchema), async (c) => {
    await revokeByToken(db(c.env.DB), c.req.valid('json').refreshToken);
    return c.json({ ok: true as const });
  })

  /** Always 200, so it cannot be used to test which addresses are registered. */
  .post('/forgot', zValidator('json', forgotPasswordSchema), async (c) => {
    const { email } = c.req.valid('json');
    await enforceRateLimit(c.env.CACHE, 'resendCode', email);

    const client = db(c.env.DB);
    const user = await client.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });

    if (user) {
      const code = await issueCode(client, requireSecret(c.env), user.id, 'reset');
      await sendCodeEmail(c.env, email, 'reset', code);
    }

    return c.json({ ok: true as const });
  })

  /** Resets the password and signs every device out (§4.3). */
  .post('/reset', zValidator('json', resetPasswordSchema), async (c) => {
    const { email, code, newPassword } = c.req.valid('json');
    await enforceRateLimit(c.env.CACHE, 'login', `${email}:${clientIp(c.req.raw)}`);
    assertPasswordAllowed(newPassword);

    const client = db(c.env.DB);
    const user = await client.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (!user) throw badRequest('That code is no longer valid — request a new one');

    const ok = await consumeCode(client, requireSecret(c.env), user.id, 'reset', code);
    if (!ok) throw badRequest('That code is incorrect');

    const { hash, salt } = await hashPassword(newPassword);
    await client
      .update(users)
      .set({
        passwordHash: hash,
        passwordSalt: salt,
        // Completing a reset proves control of the address.
        emailVerifiedAt: nowIso(),
      })
      .where(eq(users.id, user.id));

    await revokeAllSessions(client, user.id);
    return c.json({ ok: true as const });
  })

  .post(
    '/change-password',
    requireAuth,
    zValidator('json', changePasswordSchema),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid('json');
      assertPasswordAllowed(newPassword);

      const client = db(c.env.DB);
      const userId = currentUserId(c);
      const user = await client.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) throw unauthorized();

      if (
        !(await verifyPassword(currentPassword, {
          hash: user.passwordHash,
          salt: user.passwordSalt,
        }))
      ) {
        throw badRequest('That current password is incorrect');
      }

      const { hash, salt } = await hashPassword(newPassword);
      await client
        .update(users)
        .set({ passwordHash: hash, passwordSalt: salt })
        .where(eq(users.id, userId));

      // Changing a password signs other devices out; the caller then logs in again.
      await revokeAllSessions(client, userId);
      return c.json({ ok: true as const });
    },
  );

/** The caller's own record. Never includes the password hash or salt. */
export function publicSelf(user: {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  timezone: string;
  goalKey: string | null;
  goalKey2: string | null;
  goalKeys: string[] | null;
  goalText: string | null;
  interestText: string | null;
  occupationKey: string | null;
  occupationText: string | null;
  educationLevel: string | null;
  /**
   * The caller's own date of birth (§2.8). On `publicSelf` only — `users.ts`
   * builds another person's profile field by field and this is not one of
   * them. What the client needs it for is knowing whether the question has
   * been answered, not showing it to anybody.
   */
  dateOfBirth: string | null;
  institution: string | null;
  majorKey: string | null;
  majorText: string | null;
  country: string | null;
  city: string | null;
  bio: string | null;
  isOpenBuddy: boolean;
  onboardedAt: string | null;
  createdAt: string;
}) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    handle: user.handle,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    timezone: user.timezone,
    goalKey: user.goalKey,
    goalKey2: user.goalKey2,
    /**
     * The full ordered list. Falls back to the indexed pair for an account that
     * predates the column, so a client can read this one field and never have
     * to reassemble the pair itself.
     */
    goalKeys: user.goalKeys ?? [user.goalKey, user.goalKey2].filter((k): k is string => k !== null),
    goalText: user.goalText,
    interestText: user.interestText,
    occupationKey: user.occupationKey,
    occupationText: user.occupationText,
    educationLevel: user.educationLevel,
    dateOfBirth: user.dateOfBirth,
    institution: user.institution,
    majorKey: user.majorKey,
    majorText: user.majorText,
    country: user.country,
    city: user.city,
    bio: user.bio,
    isOpenBuddy: user.isOpenBuddy,
    createdAt: user.createdAt,
    /** Drives the app's choice between the onboarding stack and the tabs (§5.2). */
    onboarded: user.onboardedAt !== null,
    /**
     * Whether the handle is a real one or still the placeholder registration
     * assigns. A client cannot work this out for itself — the placeholder is
     * derived from the user id and looks like any other handle — and it has to,
     * because onboarding cannot complete without a claimed handle. Without this,
     * a signed-in user with no handle answers every question, fails to complete,
     * and is sent back to the first question forever.
     */
    handleClaimed: user.handle !== placeholderHandle(user.id),
  };
}
