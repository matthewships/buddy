import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { useLogin } from '@/api/auth';
import { Button, ErrorText, Field, Screen } from '@/components';

export default function Login() {
  const router = useRouter();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.includes('@') && password.length > 0 && !login.isPending;

  const submit = () => {
    login.mutate(
      { email: email.trim().toLowerCase(), password },
      {
        onSuccess: (result) => {
          // An unverified account is not an error — it needs the code screen.
          if (result.kind === 'verificationRequired') {
            router.push({ pathname: '/(auth)/verify', params: { email: result.email } });
            return;
          }
          router.replace('/');
        },
      },
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="gap-4">
          <Text className="mt-4 text-3xl font-bold text-ink">Welcome back</Text>

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
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => canSubmit && submit()}
          />

          <ErrorText message={login.error?.message} />

          <Button label="Sign in" onPress={submit} disabled={!canSubmit} loading={login.isPending} />
          <Button
            label="Forgot your password?"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/(auth)/forgot',
                params: { email: email.trim().toLowerCase() },
              })
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
