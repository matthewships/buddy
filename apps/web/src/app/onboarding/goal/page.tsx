'use client';

import { useRouter } from 'next/navigation';

import { GOALS, MAX_GOAL_TEXT } from '@buddy/shared';

import { Button, Chips, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingGoal() {
  const router = useRouter();
  const goalKey = useDraft((d) => d.goalKey);
  const goalText = useDraft((d) => d.goalText);
  const setDraft = useDraft((d) => d.set);

  // A `custom` goal must carry text — the same rule the API enforces (§2.1).
  const needsText = goalKey === 'custom';
  const canContinue = goalKey !== null && (!needsText || goalText.trim().length > 0);

  return (
    <Screen>
      <div className="flex flex-col gap-4 pb-8">
        <h1 className="mt-4 text-3xl font-bold text-ink">What are you working toward?</h1>
        <p className="text-base text-ink-muted">
          This is the first thing a buddy sees, and it drives who we match you with.
        </p>

        <Chips
          label="Goal"
          options={GOALS}
          selected={goalKey}
          onSelect={(value) => setDraft({ goalKey: value })}
        />

        <Field
          label={needsText ? 'Your goal' : 'Add a detail (optional)'}
          value={goalText}
          onChangeText={(value) => setDraft({ goalText: value })}
          maxLength={MAX_GOAL_TEXT}
          placeholder={needsText ? 'Finish my dissertation' : 'e.g. Organic chemistry finals'}
        />

        <Button
          label="Continue"
          disabled={!canContinue}
          onClick={() => router.push('/onboarding/occupation')}
        />
      </div>
    </Screen>
  );
}
