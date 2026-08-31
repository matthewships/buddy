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
 */
export const SIGNUP_STEPS = [
  { path: '/start/level', title: 'What are you studying?' },
  { path: '/start/institution', title: 'Where do you study?' },
  { path: '/start/major', title: 'What do you study?' },
  { path: '/start/origin', title: 'Where are you from?' },
  { path: '/start/goal', title: 'What are you working toward?' },
  { path: '/start/topics', title: 'What do you love talking about?' },
  { path: '/start/interests', title: 'What do you do for fun?' },
  { path: '/start/about', title: 'Anything else?' },
  { path: '/start/buddy', title: 'Will you be someone’s buddy?' },
] as const;

export type SignupStepPath = (typeof SIGNUP_STEPS)[number]['path'];

export const FIRST_STEP = SIGNUP_STEPS[0].path;

export function stepIndex(path: string): number {
  return SIGNUP_STEPS.findIndex((step) => step.path === path);
}

/** The next question, or `null` when this was the last one. */
export function nextStep(path: string): string | null {
  const index = stepIndex(path);
  return index >= 0 && index < SIGNUP_STEPS.length - 1 ? SIGNUP_STEPS[index + 1]!.path : null;
}
