'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { EMAIL_CODE_LENGTH } from '@buddy/shared';

import { useResendCode, useVerifyEmail } from '@/api/auth';
import { Button, ErrorText, Field, LoadingScreen, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

function VerifyForm() {
  const router = useRouter();
  // The mobile screen gets this from route params; on the web it is a query
  // string, so the URL survives a refresh and a page restore.
  const email = useSearchParams().get('email') ?? '';

  const verify = useVerifyEmail();
  const resend = useResendCode();
  // Answers collected before the account existed, waiting to be written.
  const hasDraft = useDraft((d) => d.educationLevel !== null || d.goalKeys.length > 0);
  /**
   * Deliberately *not* folded into `hasDraft`. A token is not an answer, and
   * `/onboarding/done` writes the draft to `PATCH /me` the moment it renders —
   * so treating "has an invite" as "has answers" would send someone with an
   * empty draft there and overwrite their real profile with blanks. It only
   * decides where a verification with nothing to save goes.
   */
  const inviteToken = useDraft((d) => d.inviteToken);

  const [code, setCode] = useState('');
  const canSubmit = code.length === EMAIL_CODE_LENGTH && !verify.isPending;

  const submit = () => {
    if (!canSubmit) return;
    verify.mutate(
      { email, code },
      {
        /*
          Verification signs the user in. Someone who came through the questions
          has answers waiting in the draft and goes straight to the write —
          which redeems any invite token afterwards, so answers win over the
          link. With nothing to write, an invite is the next best destination;
          failing that `/`, which routes on `onboarded` as it always did.
        */
        onSuccess: () =>
          router.replace(
            hasDraft ? '/onboarding/done' : inviteToken ? `/join/${inviteToken}` : '/',
          ),
      },
    );
  };

  return (
    <Screen>
      <div className="flex flex-col gap-4">
        <h1 className="mt-4 text-3xl font-bold text-ink">Check your email</h1>
        <p className="text-base text-ink-muted">
          We sent a {EMAIL_CODE_LENGTH}-digit code to {email}.
        </p>

        <Field
          label="Verification code"
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={EMAIL_CODE_LENGTH}
          onSubmit={submit}
        />

        <ErrorText message={verify.error?.message} />

        <Button label="Verify" onClick={submit} disabled={!canSubmit} loading={verify.isPending} />
        <Button
          label={resend.isSuccess ? 'Code sent' : 'Send a new code'}
          variant="ghost"
          disabled={resend.isPending || resend.isSuccess}
          onClick={() => resend.mutate({ email, purpose: 'verify' })}
        />
        <ErrorText message={resend.error?.message} />
      </div>
    </Screen>
  );
}

/**
 * `useSearchParams` suspends during prerender, so the boundary is required —
 * without it the build refuses to statically render this route.
 */
export default function Verify() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <VerifyForm />
    </Suspense>
  );
}
