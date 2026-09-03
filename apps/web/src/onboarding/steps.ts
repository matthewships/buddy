/**
 * The signup questionnaire, in order.
 *
 * One list drives three things that would otherwise drift: the progress bar's
 * denominator, "Continue" knowing where it goes, and the back link knowing
 * where it came from. Adding or reordering a question is an edit here.
 *
 * Registration is deliberately not in the list. It is not a question about the
 * user, it is the commitment the questions have been earning — and the progress
 * bar should read "done" by the time it appears.
 *
 * **Revised 2026-09-03 — six screens, not ten, and the product's own act in
 * the middle of them (§2.9).** The old list asked nine things about a person
 * and nothing about their day; the first task somebody wrote down was on a
 * screen after registration, verification and a photo prompt. Now the fourth
 * screen is "what will you finish today?", and everything after it exists to
 * hold that answer. The four questions that left the gate — country, topics,
 * interests, bio — were never needed to be *onboarded* (a handle, a goal and a
 * level are), and they are asked again where their answer changes something:
 * the buddy directory, through `profileStrength()` in `@buddy/shared`.
 */
export const SIGNUP_STEPS = [
  /**
   * First, and first for a reason (§2.8). It is the one question whose answer
   * can end the signup, so asking it before the other five means nobody types
   * their goal and their plan into a form that was never going to accept them —
   * and nothing about a person under the floor is collected.
   */
  { path: '/start/age', title: 'When were you born?' },
  /** Before the goal, because `goalsForLevel` filters the goal chips by it. */
  { path: '/start/level', title: 'What are you studying?' },
  { path: '/start/goal', title: 'What are you working toward?' },
  /** The product, before the account. See §2.9. */
  { path: '/start/today', title: 'What will you finish today?' },
  /**
   * Institution and field on one screen. They are the 64- and 32-point terms
   * in the match score (§2.2) — too heavy to leave the gate, light enough to
   * share a screen now that the screen after them is the last.
   */
  { path: '/start/campus', title: 'Where, and what?' },
  { path: '/start/buddy', title: 'Will you be someone’s buddy?' },
] as const;

export type SignupStepPath = (typeof SIGNUP_STEPS)[number]['path'];

export const FIRST_STEP = SIGNUP_STEPS[0].path;

/**
 * The query parameter the landing page's hero form submits the first task
 * under. Read once by `TaskFromQuery` in the intro layout, on whichever step
 * the visitor lands on, and then removed from the URL.
 */
export const TASK_PARAM = 'task';

export function stepIndex(path: string): number {
  return SIGNUP_STEPS.findIndex((step) => step.path === path);
}

/** The next question, or `null` when this was the last one. */
export function nextStep(path: string): string | null {
  const index = stepIndex(path);
  return index >= 0 && index < SIGNUP_STEPS.length - 1 ? SIGNUP_STEPS[index + 1]!.path : null;
}
