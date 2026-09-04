'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { SIGNUP_STEPS, nextStep, stepIndex } from '@/onboarding/steps';

import { Button } from './Button';
import { Screen } from './Frame';

/**
 * One question in the signup flow.
 *
 * Every step gets the same frame — progress, title, body, one primary action —
 * because a questionnaire that changes shape between questions reads as several
 * unrelated forms. (The most cited critique of Finch's onboarding is exactly
 * this: a progress bar that appears partway through, so the user cannot tell
 * how much is left until they are already committed.)
 *
 * The progress is drawn as one block per step rather than a single bar. Six
 * blocks say "six questions" at a glance, which a bar at 33% does not, and
 * they are square because the direction is (§5.8).
 *
 * `onContinue` is optional: most steps just save to the draft as the user types
 * and need nothing more than navigation.
 */
export function QuestionScreen({
  title,
  subtitle,
  canContinue,
  onContinue,
  continueLabel = 'Continue',
  nextHref,
  skipLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  canContinue: boolean;
  onContinue?: () => void;
  continueLabel?: string;
  /** Overrides the step order — only the last question needs it. */
  nextHref?: string;
  /** Shown when a question is optional, so skipping is visibly allowed. */
  skipLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const index = stepIndex(pathname);
  const total = SIGNUP_STEPS.length;
  // Back from the first question is the landing page — where the visitor came
  // from — not the compact /welcome, which exists for a signed-out session.
  const previous = index > 0 ? SIGNUP_STEPS[index - 1]!.path : '/';
  const next = nextStep(pathname);

  const go = () => {
    onContinue?.();
    // The last question hands off to registration, which is not a step.
    router.push(nextHref ?? next ?? '/register');
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4 pb-8">
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex flex-row items-center justify-between">
            <Link
              href={previous}
              className="cursor-pointer text-sm font-semibold text-ink-muted hover:text-ink"
            >
              ← Back
            </Link>
            <span className="eyebrow">
              Step {index + 1} of {total}
            </span>
          </div>
          {/*
            `aria-hidden`, with the same information in the text above: a
            progressbar role announces a percentage, and "step 3 of 6" is what
            the user actually wants to hear.
          */}
          <div aria-hidden="true" className="flex flex-row gap-1">
            {SIGNUP_STEPS.map((step, i) => (
              <span
                key={step.path}
                className={`h-1.5 flex-1 transition-colors duration-300 ${
                  i <= index ? 'bg-brand' : 'bg-surface-border'
                }`}
              />
            ))}
          </div>
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-base leading-relaxed text-ink-muted">{subtitle}</p> : null}

        {children}

        <div className="mt-2 flex flex-col gap-2">
          <Button label={continueLabel} disabled={!canContinue} onClick={go} />
          {skipLabel && !canContinue ? (
            <Button label={skipLabel} variant="ghost" onClick={go} />
          ) : null}
        </div>
      </div>
    </Screen>
  );
}
