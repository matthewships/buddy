'use client';

import { MIN_AGE_YEARS, ageOn, isOldEnough, isPlausibleBirthDate } from '@buddy/shared';

import { ErrorText, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The age gate (§2.8), and the first thing signup asks.
 *
 * **Why it is first.** It is the only question whose answer can end the signup.
 * Asking it after the institution, the subject and the goals would mean
 * collecting eight answers from somebody the product is about to turn away —
 * which is both rude and the opposite of what data minimisation asks for. Ask
 * it, decide, and collect nothing else from anybody under the floor.
 *
 * **A date, not a checkbox.** "I confirm I am over 16" is a box people tick
 * without reading, and it records nothing that could later be checked. A date
 * is a real answer, stored once, and the same one the API validates.
 *
 * **The floor is not printed on the screen.** The subtitle explains why the
 * question is asked and the error says what went wrong once it has, but the
 * empty state does not lead with "you must be 16" — a number shown before the
 * input is an instruction for what to type. This is a soft measure and worth
 * being honest about: a determined fifteen-year-old will simply enter a
 * different year. It stops the careless case, not the motivated one, and the
 * product is not able to verify an age it is only ever told.
 *
 * `type="date"` gives every platform its own native picker, which is far better
 * than three selects — and it is the one input where the browser's own
 * formatting beats anything hand-rolled, because date order is a locale
 * question this app has no business answering.
 */
export default function AgeStep() {
  const dateOfBirth = useDraft((d) => d.dateOfBirth);
  const setDraft = useDraft((d) => d.set);

  const answered = dateOfBirth.length > 0;
  const plausible = answered && isPlausibleBirthDate(dateOfBirth);
  const oldEnough = answered && isOldEnough(dateOfBirth);
  const age = answered ? ageOn(dateOfBirth) : null;

  const error = !answered
    ? undefined
    : !plausible
      ? 'That is not a date in the past. Check the year.'
      : !oldEnough
        ? `Buddy is for people aged ${MIN_AGE_YEARS} and over. Thanks for trying it — please come back.`
        : undefined;

  return (
    <QuestionScreen
      title="When were you born?"
      subtitle="Buddy puts you in a group with people you have not met, so we ask everyone's age before anything else."
      canContinue={oldEnough}
    >
      <Field
        label="Date of birth"
        type="date"
        value={dateOfBirth}
        onChangeText={(value) => setDraft({ dateOfBirth: value })}
      />

      <ErrorText message={error} />

      {oldEnough && age !== null ? (
        <p className="text-sm text-ink-muted">
          That makes you {age}. We ask once and you will not be asked again.
        </p>
      ) : null}
    </QuestionScreen>
  );
}
