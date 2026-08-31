'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { EDUCATION_LEVELS, MAJORS, MAX_HANDLE, MIN_HANDLE } from '@buddy/shared';

import { useHandleAvailable, useMe, useUpdateMe } from '@/api/auth';
import { useUploadAvatar } from '@/api/avatar';
import { Avatar, Button, Card, ErrorText, Field, Screen } from '@/components';
import { draftToPatch, useDraft } from '@/onboarding/draft';

function labelFor(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * The single write that saves everything the questions collected, and the point
 * at which the API stamps `onboarded_at`.
 *
 * The photo is asked for here rather than as a tenth question. It is the one
 * answer that needs an account to exist — the upload is authenticated and keyed
 * by user id — and putting a file picker in the middle of the flow is the kind
 * of step people abandon on. Skipping is a plain choice, not a penalty; the
 * profile prompts for it later.
 *
 * So is the handle, in one specific case. Someone who registered on the mobile
 * app and never finished lands here already signed in, which means the flow
 * skipped `/register` — the only screen that asks for a handle. Onboarding
 * cannot complete without one, so without this field they would answer every
 * question, fail to complete, and be sent back to the first question forever.
 */
export default function OnboardingDone() {
  const router = useRouter();
  const draft = useDraft();
  const me = useMe();
  const updateMe = useUpdateMe();
  const uploadAvatar = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

  // Only for the signed-in-but-handle-less case above. Everyone who came
  // through /register already claimed one, and is never asked again.
  const needsHandle = me.data ? !me.data.handleClaimed && !draft.handle.trim() : false;
  const handle = draft.handle.trim().toLowerCase();
  const handleWellFormed =
    /^[a-z0-9_]+$/.test(handle) && handle.length >= MIN_HANDLE && handle.length <= MAX_HANDLE;
  // This user has a session, so the live check is available here — unlike on
  // /register, where there is no token yet.
  const availability = useHandleAvailable(needsHandle ? handle : '');
  const handleTaken = availability.data?.available === false;

  const handleError = !handle
    ? null
    : !handleWellFormed
      ? `${MIN_HANDLE}-${MAX_HANDLE} characters: letters, numbers and underscores`
      : handleTaken
        ? 'That handle is taken'
        : null;

  const canFinish = !needsHandle || (handleWellFormed && !handleTaken);

  const level = labelFor(EDUCATION_LEVELS, draft.educationLevel);
  const major = draft.majorText.trim() || labelFor(MAJORS, draft.majorKey);

  // Two phases on one screen: save, then offer the photo. The upload is
  // authenticated and keyed by user id, so it cannot run until the profile
  // exists — and navigating away on save would take the offer with it.
  const finish = () => {
    updateMe.mutate(draftToPatch(draft), { onSuccess: () => setSaved(true) });
  };

  const enter = () => {
    // Cleared only once the server has the answers: a failed write leaves them
    // in place so "Finish" can simply be pressed again.
    draft.reset();
    // Buddies, not Today: a new account has no group yet, so Today would be an
    // empty screen. Finding someone is the first real thing to do.
    router.replace('/buddies');
  };

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-4">
        <h1 className="text-3xl font-bold text-ink">
          {saved ? 'One last thing' : "You're all set"}
        </h1>
        <p className="text-base text-ink-muted">
          {[level, major, draft.institution.trim()].filter(Boolean).join(' · ') ||
            'Your profile is ready.'}
        </p>

        <Card>
          <div className="flex flex-row items-center gap-4">
            <Avatar avatarKey={null} displayName={draft.displayName || 'You'} size={56} />
            <div className="flex flex-1 flex-col">
              <p className="text-base font-semibold text-ink">Add a photo?</p>
              <p className="text-sm text-ink-muted">
                Optional — but a directory of blank circles is harder to choose from.
              </p>
            </div>
            <Button
              label={uploadAvatar.isPending ? 'Uploading…' : 'Choose'}
              variant="ghost"
              disabled={uploadAvatar.isPending || !saved}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          {!saved ? (
            <p className="mt-2 text-xs text-ink-subtle">
              Available once your profile is saved.
            </p>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so choosing the same file twice fires change again.
              event.target.value = '';
              if (file) uploadAvatar.mutate(file);
            }}
          />
          <ErrorText message={uploadAvatar.error?.message} />
        </Card>

        {needsHandle && !saved ? (
          <Field
            label="Pick a handle"
            value={draft.handle}
            onChangeText={(value) => draft.set({ handle: value.replace(/\s/g, '') })}
            error={handleError}
            hint="How buddies find and invite you"
            placeholder="e.g. alex_h"
            autoCapitalize="none"
            autoComplete="username"
          />
        ) : null}

        <ErrorText message={updateMe.error?.message} />

        <div className="mt-2">
          {saved ? (
            <Button
              label={uploadAvatar.isSuccess ? 'Find a buddy' : 'Skip for now'}
              onClick={enter}
              disabled={uploadAvatar.isPending}
            />
          ) : (
            <Button
              label="Finish"
              onClick={finish}
              loading={updateMe.isPending}
              disabled={updateMe.isPending || !canFinish}
            />
          )}
        </div>
      </div>
    </Screen>
  );
}
