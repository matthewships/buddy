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
 *
 * Asked at every level, but not in the same words. "Where do you study?" is
 * wrong for someone who graduated last summer and wrong for a postdoc, and
 * both of them still have an institution worth matching on — an alumni network
 * and a workplace respectively. The question earns its place everywhere once
 * the tense follows the answer to question one.
 */
export default function InstitutionStep() {
  const educationLevel = useDraft((d) => d.educationLevel);
  const institution = useDraft((d) => d.institution);
  const city = useDraft((d) => d.city);
  const setDraft = useDraft((d) => d.set);

  const atSchool = educationLevel === 'high_school';
  const graduated = educationLevel === 'recent_graduate';
  const working = educationLevel === 'postdoc';

  return (
    <QuestionScreen
      title={
        atSchool
          ? 'Which school do you go to?'
          : graduated
            ? 'Where did you study?'
            : working
              ? 'Where are you based?'
              : 'Where do you study?'
      }
      subtitle={graduated ? 'Where you just came from still finds you the most people.' : undefined}
      canContinue={institution.trim().length > 0}
      skipLabel="Skip for now"
    >
      <Field
        label={atSchool ? 'School' : working ? 'University or lab' : 'School or university'}
        value={institution}
        onChangeText={(value) => setDraft({ institution: value })}
        maxLength={MAX_INSTITUTION}
        placeholder={atSchool ? 'e.g. Riverside High School' : 'e.g. University of Toronto'}
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
