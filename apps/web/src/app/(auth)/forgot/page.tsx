'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { useForgotPassword } from '@/api/auth';
import { Button, ErrorText, Field, LoadingScreen, Screen } from '@/components';

function ForgotForm() {
  const router = useRouter();
  const forgot = useForgotPassword();

  const [email, setEmail] = useState(useSearchParams().get('email') ?? '');
  const canSubmit = email.includes('@') && !forgot.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const address = email.trim().toLowerCase();
    forgot.mutate(
      { email: address },
      {
        // Always 200, so the app cannot leak whether the address exists either.
        onSuccess: () => router.push(`/reset?email=${encodeURIComponent(address)}`),
      },
    );
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4">
        <h1 className="mt-4 text-3xl font-bold text-ink">Reset your password</h1>
        <p className="text-base text-ink-muted">
          Enter your email and we&apos;ll send you a reset code.
        </p>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          onSubmit={submit}
        />

        <ErrorText message={forgot.error?.message} />

        <Button
          label="Send reset code"
          onClick={submit}
          disabled={!canSubmit}
          loading={forgot.isPending}
        />
      </div>
    </Screen>
  );
}

export default function Forgot() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ForgotForm />
    </Suspense>
  );
}
