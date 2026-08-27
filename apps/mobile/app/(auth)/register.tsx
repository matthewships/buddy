import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { PASSWORD_MIN_LENGTH } from '@buddy/shared';

import { useRegister } from '@/api/auth';
import { Button, ErrorText, Field, Screen } from '@/components';

export default function Register() {
  const router = useRouter();
  const register = useRegister();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit =
    displayName.trim().length > 0 &&
    email.includes('@') &&
    password.length >= PASSWORD_MIN_LENGTH &&
    !register.isPending;

  const submit = () => {
    register.mutate(
      { email: email.trim().toLowerCase(), password, displayName: displayName.trim() },
      {
        // The API responds identically whether or not the address was already
        // registered, so the app always moves to the code screen (§4.3).
        onSuccess: () =>
          router.push({
            pathname: '/(auth)/verify',
            params: { email: email.trim().toLowerCase() },
          }),
      },
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-8">
          <Text className="mt-4 text-3xl font-bold text-ink">Create your account</Text>

          <Field
            label="Your name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
            returnKeyType="go"
            onSubmitEditing={() => canSubmit && submit()}
          />

          <ErrorText message={register.error?.message} />

          <Button
            label="Send verification code"
            onPress={submit}
            disabled={!canSubmit}
            loading={register.isPending}
          />
          <Text className="text-center text-sm text-ink-subtle">
            We&apos;ll email you a 6-digit code to confirm your address.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
