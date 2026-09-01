'use client';

import { INTERESTS, MAX_INTEREST_TEXT, MAX_INTERESTS } from '@buddy/shared';

import { Chips, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The warm, non-academic line on a profile — and, in practice, the tiebreak:
 * when four buddies are equally well matched on paper, this is what makes
 * someone send the request to one of them.
 */
export default function InterestsStep() {
  const interests = useDraft((d) => d.interests);
  const interestText = useDraft((d) => d.interestText);
  const setDraft = useDraft((d) => d.set);

  // Picking `Other` and leaving it blank says nothing, so the same rule the API
  // enforces holds the Continue button here (§2.1).
  const needsText = interests.includes('custom');
  const canContinue = interests.length > 0 && (!needsText || interestText.trim().length > 0);

  return (
    <QuestionScreen
      title="What do you do for fun?"
      subtitle={`The part of you that isn't coursework. Pick up to ${MAX_INTERESTS}.`}
      canContinue={canContinue}
      skipLabel="Skip for now"
    >
      <Chips
        label={`Hobbies and interests (max ${MAX_INTERESTS})`}
        options={INTERESTS}
        selected={interests}
        max={MAX_INTERESTS}
        onChange={(keys) => setDraft({ interests: keys })}
      />

      {/* Only once `Other` is chosen: an always-present box is one more thing
          to read past on a question most people answer with chips alone. */}
      {needsText ? (
        <Field
          label="What is it?"
          value={interestText}
          onChangeText={(value) => setDraft({ interestText: value })}
          maxLength={MAX_INTEREST_TEXT}
          placeholder="e.g. Falconry"
          autoFocus
        />
      ) : null}
    </QuestionScreen>
  );
}
