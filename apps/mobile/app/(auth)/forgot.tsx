import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useForgotPassword } from '@/api/auth';
import { Button, ErrorText, Field, Screen } from '@/components';

export default function Forgot() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const forgot = useForgotPassword();

  const [email, setEmail] = useState(params.email ?? '');
  const canSubmit = email.includes('@') && !forgot.isPending;

  const submit = () => {
    const address = email.trim().toLowerCase();
    forgot.mutate(
      { email: address },
      {
        // Always 200, so the app cannot leak whether the address exists either.
        onSuccess: () => router.push({ pathname: '/(auth)/reset', params: { email: address } }),
      },
    );
  };

  return (
    <Screen>
      <View className="gap-4">
        <Text className="mt-4 text-3xl font-bold text-ink">Reset your password</Text>
        <Text className="text-base text-ink-muted">
          Enter your email and we&apos;ll send you a reset code.
        </Text>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && submit()}
        />

        <ErrorText message={forgot.error?.message} />

        <Button
          label="Send reset code"
          onPress={submit}
          disabled={!canSubmit}
          loading={forgot.isPending}
        />
      </View>
    </Screen>
  );
}
