'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useLogin } from '@/api/auth';
import { Button, ErrorText, Field, Screen } from '@/components';

export default function Login() {
  const router = useRouter();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.includes('@') && password.length > 0 && !login.isPending;

  const submit = () => {
    if (!canSubmit) return;
    login.mutate(
      { email: email.trim().toLowerCase(), password },
      {
        onSuccess: (result) => {
          // An unverified account is not an error — it needs the code screen.
          if (result.kind === 'verificationRequired') {
            router.push(`/verify?email=${encodeURIComponent(result.email)}`);
            return;
          }
          router.replace('/');
        },
      },
    );
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4">
        <h1 className="mt-4 text-3xl font-bold text-ink">Welcome back</h1>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          type="password"
          autoComplete="current-password"
          onSubmit={submit}
        />

        <ErrorText message={login.error?.message} />

        <Button label="Sign in" onClick={submit} disabled={!canSubmit} loading={login.isPending} />
        <Button
          label="Forgot your password?"
          variant="ghost"
          onClick={() => router.push(`/forgot?email=${encodeURIComponent(email.trim().toLowerCase())}`)}
        />
      </div>
    </Screen>
  );
}
