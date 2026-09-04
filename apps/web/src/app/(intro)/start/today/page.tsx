'use client';

import { MAX_TASK_TITLE } from '@buddy/shared';

import { DurationInput, durationError, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The product, before the account (§2.9).
 *
 * Every other screen in signup asks who somebody is. This one asks what they
 * are going to do, which is the only thing Buddy is actually for — and it is
 * asked *here*, three screens before a password, because the apps that keep
 * people past their first minute are the ones that let them do the thing
 * first. Duolingo teaches a lesson before it asks for an email. This is
 * Buddy's lesson: one task, one estimate.
 *
 * The answer becomes the first task on their desk at `/onboarding/done`, and
 * the register screen shows it back to them as the reason to create the
 * account. Nothing on this screen touches the server.
 *
 * Skippable, deliberately. Someone signing up at midnight has no "today" left,
 * and a forced answer would be a fake one that a buddy is then asked to check.
 */
const PLACEHOLDER: Record<string, string> = {
  high_school: 'Finish the chemistry problem set',
  foundation: 'Outline the essay, first two sections',
  undergraduate: 'Draft the intro to my essay',
  masters: 'Read and annotate two papers',
  phd: 'Rewrite the methods section',
  postdoc: 'Get the figures for section 3 done',
  recent_graduate: 'Send three applications',
};

export default function TodayStep() {
  const educationLevel = useDraft((d) => d.educationLevel);
  const firstTask = useDraft((d) => d.firstTask);
  const minutes = useDraft((d) => d.firstTaskMinutes);
  const setDraft = useDraft((d) => d.set);

  const timeError = durationError(minutes);
  const canContinue = firstTask.trim().length > 0 && timeError === null;

  return (
    <QuestionScreen
      title="What will you finish today?"
      subtitle="One thing, small enough to finish before midnight. It becomes the first task on your desk — and the first thing a buddy checks."
      canContinue={canContinue}
      skipLabel="I’ll plan later"
    >
      <Field
        label="Today’s task"
        value={firstTask}
        onChangeText={(value) => setDraft({ firstTask: value })}
        maxLength={MAX_TASK_TITLE}
        placeholder={PLACEHOLDER[educationLevel ?? ''] ?? 'Finish the thing I keep putting off'}
        autoCapitalize="sentences"
        autoFocus
      />

      <DurationInput
        minutes={minutes}
        onChange={(value) => setDraft({ firstTaskMinutes: value })}
        error={firstTask.trim().length > 0 ? timeError : null}
      />
    </QuestionScreen>
  );
}
