'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
    if (!canSubmit) return;
    const address = email.trim().toLowerCase();
    register.mutate(
      { email: address, password, displayName: displayName.trim() },
      {
        // The API responds identically whether or not the address was already
        // registered, so the app always moves to the code screen (§4.3).
        onSuccess: () => router.push(`/verify?email=${encodeURIComponent(address)}`),
      },
    );
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4 pb-8">
        <h1 className="mt-4 text-3xl font-bold text-ink">Create your account</h1>

        <Field
          label="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoComplete="name"
        />
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
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          onSubmit={submit}
        />

        <ErrorText message={register.error?.message} />

        <Button
          label="Send verification code"
          onClick={submit}
          disabled={!canSubmit}
          loading={register.isPending}
        />
        <p className="text-center text-sm text-ink-subtle">
          We&apos;ll email you a 6-digit code to confirm your address.
        </p>
      </div>
    </Screen>
  );
}
