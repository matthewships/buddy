'use client';

import { MAJORS, MAX_MAJOR_TEXT } from '@buddy/shared';

import { Chips, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function MajorStep() {
  const majorKey = useDraft((d) => d.majorKey);
  const majorText = useDraft((d) => d.majorText);
  const setDraft = useDraft((d) => d.set);

  // "Other" has to carry text — the same rule the API enforces (§2.1).
  const needsText = majorKey === 'custom';
  const canContinue = majorKey !== null && (!needsText || majorText.trim().length > 0);

  return (
    <QuestionScreen
      title="What do you study?"
      subtitle="Broad is fine — this is for finding people in the same world as you, not for your transcript."
      canContinue={canContinue}
    >
      <Chips
        label="Field of study"
        options={MAJORS}
        selected={majorKey}
        onSelect={(key) => setDraft({ majorKey: key })}
      />
      {majorKey ? (
        <Field
          label={needsText ? 'Your subject' : 'Add a detail (optional)'}
          value={majorText}
          onChangeText={(value) => setDraft({ majorText: value })}
          maxLength={MAX_MAJOR_TEXT}
          placeholder={needsText ? 'e.g. Egyptology' : 'e.g. Organic chemistry'}
        />
      ) : null}
    </QuestionScreen>
  );
}
