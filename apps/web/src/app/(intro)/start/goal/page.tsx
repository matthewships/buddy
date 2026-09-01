'use client';

import { goalsForLevel, MAX_GOAL_TEXT } from '@buddy/shared';

import { Chips, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The one question that is about what someone is *doing* rather than who they
 * are, and the one the whole accountability loop hangs off — so it stays in
 * signup, and it stays weighted highest in the directory's matching.
 *
 * The options follow the answer to question one. Offering "Thesis /
 * dissertation" to a fifteen-year-old is not a harmless extra chip: it is the
 * moment they work out the product was not built for them.
 */
export default function GoalStep() {
  const educationLevel = useDraft((d) => d.educationLevel);
  const goalKeys = useDraft((d) => d.goalKeys);
  const goalText = useDraft((d) => d.goalText);
  const setDraft = useDraft((d) => d.set);

  // Anything already picked stays on screen even if a later change of level
  // would have hidden it, so a chip can always be un-picked by the person who
  // picked it.
  const options = goalsForLevel(educationLevel, goalKeys);

  // A `custom` goal must carry text — the same rule the API enforces (§2.1).
  // It applies wherever "Other" sits in the list, not just in the first slot.
  const needsText = goalKeys.includes('custom');
  const canContinue = goalKeys.length > 0 && (!needsText || goalText.trim().length > 0);

  return (
    <QuestionScreen
      title="What are you working toward?"
      subtitle="This is what a buddy holds you to, and it counts for more than anything else when we match you."
      canContinue={canContinue}
    >
      {/*
        Uncapped. The first two picks are still the ones the directory matches
        and a buddy card shows, but that is a storage and layout fact, and
        making it the user's problem meant asking someone with three things on
        their plate to pretend they had two.
      */}
      <Chips
        label="Goals"
        options={options}
        selected={goalKeys}
        onChange={(keys) => setDraft({ goalKeys: keys })}
      />

      <Field
        label={needsText ? 'Your goal' : 'Add a detail (optional)'}
        value={goalText}
        onChangeText={(value) => setDraft({ goalText: value })}
        maxLength={MAX_GOAL_TEXT}
        hint={`${goalText.length}/${MAX_GOAL_TEXT}`}
        placeholder={
          needsText
            ? educationLevel === 'high_school'
              ? 'Get into my first-choice university'
              : 'Finish my dissertation'
            : 'e.g. Organic chemistry finals'
        }
      />
    </QuestionScreen>
  );
}
