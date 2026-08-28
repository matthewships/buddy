'use client';

import { useRouter } from 'next/navigation';

import { MAX_OCCUPATION_TEXT, OCCUPATIONS } from '@buddy/shared';

import { Button, Chips, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingOccupation() {
  const router = useRouter();
  const occupationKey = useDraft((d) => d.occupationKey);
  const occupationText = useDraft((d) => d.occupationText);
  const setDraft = useDraft((d) => d.set);

  const needsText = occupationKey === 'custom';
  const canContinue = occupationKey !== null && (!needsText || occupationText.trim().length > 0);

  return (
    <Screen>
      <div className="flex flex-col gap-4 pb-8">
        <h1 className="mt-4 text-3xl font-bold text-ink">What do you do?</h1>
        <p className="text-base text-ink-muted">
          Buddies with similar lives tend to keep similar hours.
        </p>

        <Chips
          label="Occupation"
          options={OCCUPATIONS}
          selected={occupationKey}
          onSelect={(value) => setDraft({ occupationKey: value })}
        />

        <Field
          label={needsText ? 'What you do' : 'Field or job title (optional)'}
          value={occupationText}
          onChangeText={(value) => setDraft({ occupationText: value })}
          maxLength={MAX_OCCUPATION_TEXT}
          placeholder={needsText ? 'Nurse, night shifts' : 'e.g. Computer science'}
        />

        <Button
          label="Continue"
          disabled={!canContinue}
          onClick={() => router.push('/onboarding/buddy')}
        />
      </div>
    </Screen>
  );
}
