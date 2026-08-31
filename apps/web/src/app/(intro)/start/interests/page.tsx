'use client';

import { INTERESTS, MAX_INTERESTS } from '@buddy/shared';

import { Chips, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The warm, non-academic line on a profile — and, in practice, the tiebreak:
 * when four buddies are equally well matched on paper, this is what makes
 * someone send the request to one of them.
 */
export default function InterestsStep() {
  const interests = useDraft((d) => d.interests);
  const setDraft = useDraft((d) => d.set);

  return (
    <QuestionScreen
      title="What do you do for fun?"
      subtitle={`The part of you that isn't coursework. Pick up to ${MAX_INTERESTS}.`}
      canContinue={interests.length > 0}
      skipLabel="Skip for now"
    >
      <Chips
        label={`Hobbies and interests (max ${MAX_INTERESTS})`}
        options={INTERESTS}
        selected={interests}
        max={MAX_INTERESTS}
        onChange={(keys) => setDraft({ interests: keys })}
      />
    </QuestionScreen>
  );
}
