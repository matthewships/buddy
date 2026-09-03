'use client';

import { majorsForLevel, MAX_CITY, MAX_INSTITUTION, MAX_MAJOR_TEXT } from '@buddy/shared';

import { Chips, Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * Institution and field of study, on one screen.
 *
 * They were two screens and they are the two heaviest matching terms after the
 * goal — 64 and 32 points in the directory's score (§2.2) — so they could not
 * leave the gate the way country, topics and interests did (§2.9). Sharing a
 * screen is the compromise: one fewer step, and the two answers that together
 * mean "people in the same world as me" are asked in one breath.
 *
 * Free text for the institution, not a picker: there is no institution list in
 * this repo and any curated one would be both incomplete and immediately out of
 * date. The server folds "MIT" and "M.I.T." with `normaliseInstitution()`.
 *
 * The tense follows the answer to the level question. "Where do you study?" is
 * wrong for someone who graduated last summer and wrong for a postdoc, and both
 * still have an institution worth matching on.
 */
export default function CampusStep() {
  const educationLevel = useDraft((d) => d.educationLevel);
  const institution = useDraft((d) => d.institution);
  const city = useDraft((d) => d.city);
  const majorKey = useDraft((d) => d.majorKey);
  const majorText = useDraft((d) => d.majorText);
  const setDraft = useDraft((d) => d.set);

  const atSchool = educationLevel === 'high_school';
  const graduated = educationLevel === 'recent_graduate';
  const working = educationLevel === 'postdoc';

  // A selection made before a change of level stays visible, so it can be
  // changed rather than silently held.
  const options = majorsForLevel(educationLevel, majorKey ? [majorKey] : []);

  // "Other" has to carry text — the same rule the API enforces (§2.1).
  const needsText = majorKey === 'custom';
  const canContinue =
    institution.trim().length > 0 && majorKey !== null && (!needsText || majorText.trim().length > 0);

  return (
    <QuestionScreen
      title={
        atSchool
          ? 'Which school, and which subject?'
          : graduated
            ? 'Where did you study, and what?'
            : working
              ? 'Where are you based, and in what?'
              : 'Where do you study, and what?'
      }
      subtitle="This is how the directory finds people in the same world as you. Broad is fine."
      canContinue={canContinue}
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
