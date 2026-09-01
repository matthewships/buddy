'use client';

import { MAX_CITY, MAX_INSTITUTION } from '@buddy/shared';

import { Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * Free text, not a picker. There is no institution list in this repo, and any
 * curated one would be both incomplete and immediately out of date — a student
 * whose school is missing from a dropdown cannot answer at all.
 *
 * What that costs is matching: "MIT" and "M.I.T." are different strings. The
 * server folds them with `normaliseInstitution()` before storing, so the
 * directory still treats them as one school.
 */
export default function InstitutionStep() {
  const institution = useDraft((d) => d.institution);
  const city = useDraft((d) => d.city);
  const setDraft = useDraft((d) => d.set);

  return (
    <QuestionScreen
      title="Where do you study?"
      canContinue={institution.trim().length > 0}
      skipLabel="Skip for now"
    >
      <Field
        label="School or university"
        value={institution}
        onChangeText={(value) => setDraft({ institution: value })}
        maxLength={MAX_INSTITUTION}
        placeholder="e.g. University of Toronto"
        autoCapitalize="words"
        autoFocus
      />
      <Field
        label="City (optional)"
        value={city}
        onChangeText={(value) => setDraft({ city: value })}
        maxLength={MAX_CITY}
        placeholder="e.g. Toronto"
        autoCapitalize="words"
      />
    </QuestionScreen>
  );
}
