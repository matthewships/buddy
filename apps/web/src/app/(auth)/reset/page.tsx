'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { EMAIL_CODE_LENGTH, PASSWORD_MIN_LENGTH } from '@buddy/shared';

import { useResetPassword } from '@/api/auth';
import { Button, ErrorText, Field, LoadingScreen, Screen } from '@/components';

function ResetForm() {
  const router = useRouter();
  const email = useSearchParams().get('email') ?? '';
  const reset = useResetPassword();

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const canSubmit =
    code.length === EMAIL_CODE_LENGTH &&
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    !reset.isPending;

  const submit = () => {
    if (!canSubmit) return;
    reset.mutate(
      { email, code, newPassword },
      // Resetting revokes every session, so the user signs in fresh.
      { onSuccess: () => router.replace('/login') },
    );
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4">
        <h1 className="mt-4 text-3xl font-bold text-ink">Choose a new password</h1>
        <p className="text-base text-ink-muted">
          Enter the code we sent to {email} and a new password.
        </p>

        <Field
          label="Reset code"
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={EMAIL_CODE_LENGTH}
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          onSubmit={submit}
        />

        <ErrorText message={reset.error?.message} />

        <Button
          label="Reset password"
          onClick={submit}
          disabled={!canSubmit}
          loading={reset.isPending}
        />
      </div>
    </Screen>
  );
}

export default function Reset() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ResetForm />
    </Suspense>
  );
}
