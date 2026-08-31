'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { EDUCATION_LEVELS, MAJORS } from '@buddy/shared';

import { useUpdateMe } from '@/api/auth';
import { useUploadAvatar } from '@/api/avatar';
import { Avatar, Button, Card, ErrorText, Screen } from '@/components';
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
 */
export default function OnboardingDone() {
  const router = useRouter();
  const draft = useDraft();
  const updateMe = useUpdateMe();
  const uploadAvatar = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

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
              disabled={updateMe.isPending}
            />
          )}
        </div>
      </div>
    </Screen>
  );
}
