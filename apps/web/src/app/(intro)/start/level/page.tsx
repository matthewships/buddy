'use client';

import { EDUCATION_LEVELS } from '@buddy/shared';

import { Chips, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The first question, and deliberately the easiest one: a single tap, no
 * typing, nothing personal. Finch's onboarding opens the same way — pick an egg
 * colour — and the reason is retention, not decoration: the first screen is
 * where abandonment concentrates, and a text field there costs more than it
 * collects.
 */
export default function LevelStep() {
  const educationLevel = useDraft((d) => d.educationLevel);
  const setDraft = useDraft((d) => d.set);

  return (
    <QuestionScreen
      title="What are you studying?"
      subtitle="Buddy is for students. This is the first thing another student sees about you."
      canContinue={educationLevel !== null}
    >
      <Chips
        label="Level of study"
        options={EDUCATION_LEVELS}
        selected={educationLevel}
        onSelect={(key) => setDraft({ educationLevel: key })}
      />
    </QuestionScreen>
  );
}
