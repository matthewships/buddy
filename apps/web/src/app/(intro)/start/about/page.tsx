'use client';

import { MAX_BIO } from '@buddy/shared';

import { Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function AboutStep() {
  const bio = useDraft((d) => d.bio);
  const setDraft = useDraft((d) => d.set);

  return (
    <QuestionScreen
      title="Anything else?"
      subtitle="A line in your own words. Everything above is a category; this is the part that sounds like you."
      canContinue={bio.trim().length > 0}
      skipLabel="Skip for now"
    >
      <Field
        label="About you (optional)"
        value={bio}
        onChangeText={(value) => setDraft({ bio: value })}
        maxLength={MAX_BIO}
        hint={`${bio.length}/${MAX_BIO}`}
        multiline
        rows={4}
        placeholder="Night owl, second-year, trying to stop rewriting the same chapter."
      />
    </QuestionScreen>
  );
}
