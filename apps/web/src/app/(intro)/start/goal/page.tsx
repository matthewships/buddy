'use client';

import { GOALS, MAX_GOALS, MAX_GOAL_TEXT } from '@buddy/shared';

import { Chips, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The one question that is about what someone is *doing* rather than who they
 * are, and the one the whole accountability loop hangs off — so it stays in
 * signup, and it stays weighted highest in the directory's matching.
 */
export default function GoalStep() {
  const goalKeys = useDraft((d) => d.goalKeys);
  const goalText = useDraft((d) => d.goalText);
  const setDraft = useDraft((d) => d.set);

  // A `custom` goal must carry text — the same rule the API enforces (§2.1).
  // It applies wherever "Other" sits in the pair, not just in the first slot.
  const needsText = goalKeys.includes('custom');
  const canContinue = goalKeys.length > 0 && (!needsText || goalText.trim().length > 0);

  return (
    <QuestionScreen
      title="What are you working toward?"
      subtitle={`This is what a buddy holds you to, and it counts for more than anything else when we match you. Pick up to ${MAX_GOALS}.`}
      canContinue={canContinue}
    >
      <Chips
        label={`Goal (max ${MAX_GOALS})`}
        options={GOALS}
        selected={goalKeys}
        max={MAX_GOALS}
        onChange={(keys) => setDraft({ goalKeys: keys })}
      />

      <Field
        label={needsText ? 'Your goal' : 'Add a detail (optional)'}
        value={goalText}
        onChangeText={(value) => setDraft({ goalText: value })}
        maxLength={MAX_GOAL_TEXT}
        hint={`${goalText.length}/${MAX_GOAL_TEXT}`}
        placeholder={needsText ? 'Finish my dissertation' : 'e.g. Organic chemistry finals'}
      />
    </QuestionScreen>
  );
}
