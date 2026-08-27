import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { EMAIL_CODE_LENGTH } from '@buddy/shared';

import { useResendCode, useVerifyEmail } from '@/api/auth';
import { Button, ErrorText, Field, Screen } from '@/components';

export default function Verify() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const verify = useVerifyEmail();
  const resend = useResendCode();

  const [code, setCode] = useState('');
  const canSubmit = code.length === EMAIL_CODE_LENGTH && !verify.isPending;

  const submit = () => {
    verify.mutate(
      { email, code },
      {
        // Verification signs the user in; the root route then sends them to
        // onboarding or the tabs based on `onboarded`.
        onSuccess: () => router.replace('/'),
      },
    );
  };

  return (
    <Screen>
      <View className="gap-4">
        <Text className="mt-4 text-3xl font-bold text-ink">Check your email</Text>
        <Text className="text-base text-ink-muted">
          We sent a {EMAIL_CODE_LENGTH}-digit code to {email}.
        </Text>

        <Field
          label="Verification code"
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH))}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={EMAIL_CODE_LENGTH}
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && submit()}
        />

        <ErrorText message={verify.error?.message} />

        <Button
          label="Verify"
          onPress={submit}
          disabled={!canSubmit}
          loading={verify.isPending}
        />
        <Button
          label={resend.isSuccess ? 'Code sent' : 'Send a new code'}
          variant="ghost"
          disabled={resend.isPending || resend.isSuccess}
          onPress={() => resend.mutate({ email, purpose: 'verify' })}
        />
        <ErrorText message={resend.error?.message} />
      </View>
    </Screen>
  );
}
