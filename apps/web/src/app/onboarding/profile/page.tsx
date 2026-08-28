'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { MAX_HANDLE, MIN_HANDLE } from '@buddy/shared';

import { useHandleAvailable, useMe } from '@/api/auth';
import { Button, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingProfile() {
  const router = useRouter();
  const me = useMe();

  // Subscribed field by field rather than to the whole store. The mobile screen
  // takes the whole object and lists it as an effect dependency, which re-runs
  // the effect on every keystroke; selecting narrowly means the seeding effect
  // below depends only on what it actually reads.
  const displayName = useDraft((d) => d.displayName);
  const handleValue = useDraft((d) => d.handle);
  const setDraft = useDraft((d) => d.set);

  const availability = useHandleAvailable(handleValue);

  // Seed the name from the account so the user doesn't retype it.
  const seeded = me.data?.displayName;
  useEffect(() => {
    if (seeded && displayName === '') setDraft({ displayName: seeded });
  }, [seeded, displayName, setDraft]);

  const handle = handleValue.trim().toLowerCase();
  const handleWellFormed = /^[a-z0-9_]+$/.test(handle) && handle.length >= MIN_HANDLE;
  const taken = availability.data?.available === false;

  const handleError = !handle
    ? null
    : !handleWellFormed
      ? `${MIN_HANDLE}-${MAX_HANDLE} characters: letters, numbers and underscores`
      : taken
        ? 'That handle is taken'
        : null;

  const canContinue = displayName.trim().length > 0 && handleWellFormed && !taken;

  return (
    <Screen>
      <div className="flex flex-col gap-4">
        <h1 className="mt-4 text-3xl font-bold text-ink">Set up your profile</h1>
        <p className="text-base text-ink-muted">
          Your handle is how buddies find and invite you.
        </p>

        <Field
          label="Display name"
          value={displayName}
          onChangeText={(value) => setDraft({ displayName: value })}
          autoCapitalize="words"
        />
        <Field
          label="Handle"
          value={handleValue}
          onChangeText={(value) => setDraft({ handle: value.replace(/[^A-Za-z0-9_]/g, '') })}
          autoCapitalize="none"
          maxLength={MAX_HANDLE}
          error={handleError}
          hint={
            handleWellFormed && availability.data?.available
              ? `@${handle} is available`
              : `@${handle || 'yourhandle'}`
          }
        />

        <Button
          label="Continue"
          disabled={!canContinue}
          onClick={() => router.push('/onboarding/goal')}
        />
      </div>
    </Screen>
  );
}
