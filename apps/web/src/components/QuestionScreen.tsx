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
  const previous = index > 0 ? SIGNUP_STEPS[index - 1]!.path : '/welcome';
  const next = nextStep(pathname);

  const go = () => {
    onContinue?.();
    // The last question hands off to registration, which is not a step.
    router.push(nextHref ?? next ?? '/register');
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4 pb-8">
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-row items-center justify-between">
            <Link
              href={previous}
              className="cursor-pointer text-sm font-semibold text-ink-muted hover:text-ink"
            >
              ← Back
            </Link>
            <span className="text-xs text-ink-subtle">
              {index + 1} of {total}
            </span>
          </div>
          {/*
            `aria-hidden`, with the same information in the text above: a
            progressbar role announces a percentage, and "3 of 9" is what the
            user actually wants to hear.
          */}
          <div aria-hidden="true" className="h-1 w-full rounded-full bg-surface-muted">
            <div
              className="h-1 rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <h1 className="mt-2 text-3xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="text-base text-ink-muted">{subtitle}</p> : null}

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
