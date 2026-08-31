/**
 * Registration has to satisfy `users.handle`'s NOT NULL + UNIQUE constraint
 * before the user has chosen anything, so it stores a placeholder derived from
 * the id.
 *
 * That placeholder is also the signal for "this account has not claimed a
 * handle yet", which onboarding completion depends on. It used to be inferred
 * from *the arrival of* a handle in `PATCH /me` — fine when the mobile app was
 * the only client, because it asked for the handle during onboarding. The web
 * client now asks on the register screen, so its completing patch carries no
 * handle at all, and that inference would leave every web user stuck in the
 * onboarding gate forever.
 *
 * Comparing against the exact placeholder answers the question directly, for
 * both clients, without either having to say anything new.
 */
export function placeholderHandle(userId: string): string {
  return `u${userId.slice(-12).toLowerCase()}`;
}
