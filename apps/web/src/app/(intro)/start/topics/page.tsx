'use client';

import { MAX_TOPICS, TOPICS } from '@buddy/shared';

import { Chips, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * Separate from the major on purpose: a law student whose favourite topic is
 * machine learning is exactly the match the directory should surface, and
 * folding the two questions together would hide them.
 */
export default function TopicsStep() {
  const topics = useDraft((d) => d.topics);
  const setDraft = useDraft((d) => d.set);

  return (
    <QuestionScreen
      title="What do you love talking about?"
      subtitle={`Not necessarily your subject. Pick up to ${MAX_TOPICS}.`}
      canContinue={topics.length > 0}
      skipLabel="Skip for now"
    >
      <Chips
        label={`Favourite topics (max ${MAX_TOPICS})`}
        options={TOPICS}
        selected={topics}
        max={MAX_TOPICS}
        onChange={(keys) => setDraft({ topics: keys })}
      />
    </QuestionScreen>
  );
}
