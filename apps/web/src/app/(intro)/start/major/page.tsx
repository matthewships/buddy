'use client';

import { majorsForLevel, MAX_MAJOR_TEXT } from '@buddy/shared';

import { Chips, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * Field of study — or, at school, the subjects you take.
 *
 * The question is worth keeping for every level rather than skipping it for
 * younger users, because it is the strongest matching signal after the goal.
 * What changes is the wording and the list: a school student picks from
 * subjects that exist at school, and is not asked to choose between Pharmacy
 * and Architecture.
 */
export default function MajorStep() {
  const educationLevel = useDraft((d) => d.educationLevel);
  const majorKey = useDraft((d) => d.majorKey);
  const majorText = useDraft((d) => d.majorText);
  const setDraft = useDraft((d) => d.set);

  const atSchool = educationLevel === 'high_school';
  const graduated = educationLevel === 'recent_graduate';

  // A selection made before a change of level stays visible, so it can be
  // changed rather than silently held.
  const options = majorsForLevel(educationLevel, majorKey ? [majorKey] : []);

  // "Other" has to carry text — the same rule the API enforces (§2.1).
  const needsText = majorKey === 'custom';
  const canContinue = majorKey !== null && (!needsText || majorText.trim().length > 0);

  return (
    <QuestionScreen
      title={atSchool ? 'Which subject is most yours?' : graduated ? 'What did you study?' : 'What do you study?'}
      subtitle={
        atSchool
          ? 'The one you would happily talk about. This is for finding people who like the same things, not for your report card.'
          : 'Broad is fine — this is for finding people in the same world as you, not for your transcript.'
      }
      canContinue={canContinue}
    >
      <Chips
        label={atSchool ? 'Favourite subject' : 'Field of study'}
        options={options}
        selected={majorKey}
        onSelect={(key) => setDraft({ majorKey: key })}
      />
      {majorKey ? (
        <Field
          label={needsText ? 'Your subject' : 'Add a detail (optional)'}
          value={majorText}
          onChangeText={(value) => setDraft({ majorText: value })}
          maxLength={MAX_MAJOR_TEXT}
          placeholder={needsText ? 'e.g. Egyptology' : atSchool ? 'e.g. Mechanics' : 'e.g. Organic chemistry'}
        />
      ) : null}
    </QuestionScreen>
  );
}
