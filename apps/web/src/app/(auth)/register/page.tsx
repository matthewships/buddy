'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EMAIL_CODE_LENGTH, MAX_HANDLE, MIN_HANDLE, PASSWORD_MIN_LENGTH } from '@buddy/shared';

import { useRegister } from '@/api/auth';
import { Button, DayOneCard, ErrorText, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The last step of signup rather than the first.
 *
 * It opens with the plan (§2.9): the task they typed three screens ago, the
 * goal, and who will check it. An account is the thing that holds that plan,
 * and the screen says so in that order — reason, then form. Every field below
 * the card is the price; the card is what it buys.
 *
 * The handle is claimed here, not later. It is the one answer that has to be
 * checked against everyone else's, and asking for it on the screen where the
 * account is created means a collision is reported where it was typed instead
 * of several steps afterwards. There is no live availability check: that
 * endpoint requires a session, and at this point there isn't one — so the
 * server's 409 on submit is the answer, and the message names the field.
 */
export default function Register() {
  const router = useRouter();
  const register = useRegister();

  /*
    Name and handle live in the draft, not in local state. They are answers like
    any other — a user who backs up into the questions and returns should find
    them still typed — and reading the store directly means a draft rehydrated
    from sessionStorage after the first render shows up without an effect to
    copy it across.

    Email and password are deliberately *not* in the draft. Nothing persists a
    password to storage, and there is no point holding the address once the
    account exists.
  */
  const displayName = useDraft((d) => d.displayName);
  const handle = useDraft((d) => d.handle);
  const firstTask = useDraft((d) => d.firstTask);
  const firstTaskMinutes = useDraft((d) => d.firstTaskMinutes);
  const goalKeys = useDraft((d) => d.goalKeys);
  const goalText = useDraft((d) => d.goalText);
  const inviteToken = useDraft((d) => d.inviteToken);
  const setDraft = useDraft((d) => d.set);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const normalisedHandle = handle.trim().toLowerCase();
  const handleWellFormed =
    /^[a-z0-9_]+$/.test(normalisedHandle) &&
    normalisedHandle.length >= MIN_HANDLE &&
    normalisedHandle.length <= MAX_HANDLE;

  const handleError =
    !normalisedHandle || handleWellFormed
      ? null
      : `${MIN_HANDLE}-${MAX_HANDLE} characters: letters, numbers and underscores`;

  const canSubmit =
    displayName.trim().length > 0 &&
    handleWellFormed &&
    email.includes('@') &&
    password.length >= PASSWORD_MIN_LENGTH &&
    !register.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const address = email.trim().toLowerCase();
    register.mutate(
      {
        email: address,
        password,
        displayName: displayName.trim(),
        handle: normalisedHandle,
      },
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
        <div className="mt-4 flex flex-col gap-2">
          <span className="eyebrow">Last step</span>
          <h1 className="text-3xl font-bold leading-tight text-ink">Lock it in</h1>
          <p className="text-base leading-relaxed text-ink-muted">
            {firstTask.trim()
              ? 'Your first day is planned. This is the account that holds it.'
              : 'Your answers are saved. This is the account that holds them.'}
          </p>
        </div>

        <DayOneCard
          task={firstTask}
          minutes={firstTaskMinutes}
          goalKeys={goalKeys}
          goalText={goalText}
          // An invitee's task lands in the group they were invited to, so it
          // will be checked — by whom is not known until they are in.
          checkedBy={inviteToken ? 'The group you were invited to' : null}
        />

        <Field
          label="Your name"
          value={displayName}
          onChangeText={(value) => setDraft({ displayName: value })}
          autoCapitalize="words"
          autoComplete="name"
        />
        <Field
          label="Handle"
          value={handle}
          onChangeText={(value) => setDraft({ handle: value.replace(/\s/g, '') })}
          error={handleError}
          hint="How buddies find and invite you"
          placeholder="e.g. alex_h"
          autoCapitalize="none"
          autoComplete="username"
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
          label="Create account"
          onClick={submit}
          disabled={!canSubmit}
          loading={register.isPending}
        />
        <p className="text-center text-xs text-ink-subtle">
          A {EMAIL_CODE_LENGTH}-digit code goes to your email. Your desk is on the other side of it.
        </p>
      </div>
    </Screen>
  );
}
