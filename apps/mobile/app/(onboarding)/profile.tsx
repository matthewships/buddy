import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { MAX_HANDLE, MIN_HANDLE } from '@buddy/shared';

import { useHandleAvailable, useMe } from '@/api/auth';
import { Button, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingProfile() {
  const router = useRouter();
  const me = useMe();
  const draft = useDraft();
  const availability = useHandleAvailable(draft.handle);

  // Seed the name from the account so the user doesn't retype it.
  useEffect(() => {
    if (me.data && draft.displayName === '') {
      draft.set({ displayName: me.data.displayName });
    }
  }, [me.data, draft]);

  const handle = draft.handle.trim().toLowerCase();
  const handleWellFormed = /^[a-z0-9_]+$/.test(handle) && handle.length >= MIN_HANDLE;
  const taken = availability.data?.available === false;

  const handleError = !handle
    ? null
    : !handleWellFormed
      ? `${MIN_HANDLE}-${MAX_HANDLE} characters: letters, numbers and underscores`
      : taken
        ? 'That handle is taken'
        : null;

  const canContinue = draft.displayName.trim().length > 0 && handleWellFormed && !taken;

  return (
    <Screen>
      <View className="gap-4">
        <Text className="mt-4 text-3xl font-bold text-ink">Set up your profile</Text>
        <Text className="text-base text-ink-muted">
          Your handle is how buddies find and invite you.
        </Text>

        <Field
          label="Display name"
          value={draft.displayName}
          onChangeText={(displayName) => draft.set({ displayName })}
          autoCapitalize="words"
        />
        <Field
          label="Handle"
          value={draft.handle}
          onChangeText={(value) => draft.set({ handle: value.replace(/[^A-Za-z0-9_]/g, '') })}
          autoCapitalize="none"
          autoCorrect={false}
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
          onPress={() => router.push('/(onboarding)/goal')}
        />
      </View>
    </Screen>
  );
}
