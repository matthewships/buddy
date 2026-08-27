import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { EMAIL_CODE_LENGTH, PASSWORD_MIN_LENGTH } from '@buddy/shared';

import { useResetPassword } from '@/api/auth';
import { Button, ErrorText, Field, Screen } from '@/components';

export default function Reset() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const reset = useResetPassword();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const canSubmit =
    code.length === EMAIL_CODE_LENGTH &&
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    !reset.isPending;

  const submit = () => {
    reset.mutate(
      { email, code, newPassword },
      // Resetting revokes every session, so the user signs in fresh.
      { onSuccess: () => router.replace('/(auth)/login') },
    );
  };

  return (
    <Screen>
      <View className="gap-4">
        <Text className="mt-4 text-3xl font-bold text-ink">Choose a new password</Text>
        <Text className="text-base text-ink-muted">
          Enter the code we sent to {email} and a new password.
        </Text>

        <Field
          label="Reset code"
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={EMAIL_CODE_LENGTH}
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && submit()}
        />

        <ErrorText message={reset.error?.message} />

        <Button
          label="Reset password"
          onPress={submit}
          disabled={!canSubmit}
          loading={reset.isPending}
        />
      </View>
    </Screen>
  );
}
