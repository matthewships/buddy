'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { EDUCATION_LEVELS, MAJORS, MAX_HANDLE, MIN_HANDLE } from '@buddy/shared';

import { useHandleAvailable, useMe, useUpdateMe } from '@/api/auth';
import { useUploadAvatar } from '@/api/avatar';
import { useAcceptInviteLink } from '@/api/invite-links';
import { Avatar, Button, Card, ErrorText, Field, Screen } from '@/components';
import { draftToPatch, useDraft } from '@/onboarding/draft';

function labelFor(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * The end of signup: the answers are written, and the only thing left to ask
 * for is a photo.
 *
 * The save happens on arrival rather than behind a Finish button. Every answer
 * was given several screens ago — asking someone to confirm what they already
 * typed is a step that exists for the code's benefit, not theirs, and it used
 * to make the photo a *second* action gated behind the first ("Available once
 * your profile is saved"). Now the profile is saved by the time this screen has
 * finished rendering, and the photo is a genuine choice: add one, or don't.
 *
 * The handle is the one thing that can still block the save, and only in one
 * case. Someone who registered on the mobile app and never finished lands here
 * already signed in, which means the flow skipped `/register` — the only screen
 * that asks for a handle. Onboarding cannot complete without one, so they get
 * the field and an explicit button; everyone else never sees either.
 */
export default function OnboardingDone() {
  const router = useRouter();
  const draft = useDraft();
  const me = useMe();
  const updateMe = useUpdateMe();
  const uploadAvatar = useUploadAvatar();
  const acceptInvite = useAcceptInviteLink();
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

  const canSave = !needsHandle || (handleWellFormed && !handleTaken);

  const level = labelFor(EDUCATION_LEVELS, draft.educationLevel);
  const major = draft.majorText.trim() || labelFor(MAJORS, draft.majorKey);

  const save = () => updateMe.mutate(draftToPatch(draft), { onSuccess: () => setSaved(true) });

  /**
   * Fired once, on arrival. The ref rather than `updateMe.isIdle` because React
   * runs effects twice in development, and two PATCHes racing would have the
   * second overwrite nothing but still show its error.
   */
  const autoSaved = useRef(false);
  useEffect(() => {
    if (autoSaved.current || !me.data || needsHandle || saved) return;
    autoSaved.current = true;
    // `save` closes over the draft, which no longer changes on this screen.
    save();
  }, [me.data, needsHandle, saved, save]);

  const enter = () => {
    const token = draft.inviteToken;

    /**
     * Someone who arrived on a join link is redeemed here, at the end of a flow
     * that began several screens and one email round trip ago, and lands in the
     * group they were actually invited to.
     *
     * A failure is not worth blocking on: the account is real and the profile is
     * saved, so the worst case is landing on the groups tab with the link still
     * in the message that brought them — which is recoverable. Being stuck on a
     * "you're all set" screen would not be.
     */
    if (token) {
      acceptInvite.mutate(token, {
        onSuccess: (result) => {
          draft.reset();
          router.replace(`/groups/${result.group.id}`);
        },
        onError: () => {
          draft.reset();
          router.replace('/groups');
        },
      });
      return;
    }

    // Cleared only once the server has the answers: a failed write leaves them
    // in place so the save can simply be retried.
    draft.reset();
    /**
     * Groups, not Buddies. The first real thing to do in Buddy is to write down
     * what you are going to finish today and start the clock on it — and a
     * group is where a task lives. Finding a buddy matters, but it is the
     * second move, and sending a request to a stranger is a worse first
     * experience than doing one thing you said you would do.
     */
    router.replace('/groups');
  };

  const summary = [level, major, draft.institution.trim()].filter(Boolean).join(' · ');
  const saving = updateMe.isPending;

  return (
    <Screen>
      <div className="flex flex-col gap-5 pb-8 pt-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">You&rsquo;re all set</h1>
          <p className="text-base text-ink-muted">
            {summary || 'Your profile is ready.'}
          </p>
        </div>

        {needsHandle && !saved ? (
          <Card>
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
            <div className="mt-3">
              <Button
                label="Save and continue"
                onClick={save}
                loading={saving}
                disabled={saving || !canSave}
              />
            </div>
            <ErrorText message={updateMe.error?.message} />
          </Card>
        ) : null}

        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar
              avatarKey={me.data?.avatarKey ?? null}
              displayName={draft.displayName || me.data?.displayName || 'You'}
              size={88}
            />
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-ink">
                {uploadAvatar.isSuccess ? 'Looking good' : 'Add a photo'}
              </p>
              <p className="text-sm text-ink-muted">
                Optional — but a directory of blank circles is harder to choose from.
              </p>
            </div>
            <Button
              label={
                uploadAvatar.isPending
                  ? 'Uploading…'
                  : uploadAvatar.isSuccess
                    ? 'Choose another'
                    : 'Choose a photo'
              }
              variant="secondary"
              disabled={uploadAvatar.isPending || (!saved && !uploadAvatar.isSuccess)}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>

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

        {/*
          The save is silent when it works, so it only ever speaks up to say it
          failed — with the retry beside it, because there is no other way off
          this screen.
        */}
        {!saved && !needsHandle && updateMe.isError ? (
          <Card className="border-danger">
            <p className="text-sm text-ink">Your answers didn&rsquo;t save.</p>
            <ErrorText message={updateMe.error?.message} />
            <div className="mt-2">
              <Button label="Try again" variant="secondary" onClick={save} loading={saving} />
            </div>
          </Card>
        ) : null}

        <div className="mt-1 flex flex-col gap-2">
          <Button
            label={draft.inviteToken ? 'Go to the group' : "Let's start"}
            onClick={enter}
            loading={acceptInvite.isPending}
            disabled={!saved || uploadAvatar.isPending || acceptInvite.isPending}
          />
          {/*
            Skipping the photo is the same action as finishing with one, so it
            is the same button — named for where it goes, not for what it
            declines. The line below is what makes the choice visible.
          */}
          {!uploadAvatar.isSuccess ? (
            <p className="text-center text-xs text-ink-subtle">
              You can add a photo later from your profile.
            </p>
          ) : null}
        </div>
      </div>
    </Screen>
  );
}
