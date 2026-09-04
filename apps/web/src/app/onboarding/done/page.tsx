'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { EDUCATION_LEVELS, MAJORS, MAX_HANDLE, MIN_HANDLE } from '@buddy/shared';

import { useHandleAvailable, useMe, useUpdateMe } from '@/api/auth';
import { useUploadAvatar } from '@/api/avatar';
import { useCreateGroup } from '@/api/groups';
import { useAcceptInviteLink } from '@/api/invite-links';
import { localToday, useCreateTask, useStartTask } from '@/api/tasks';
import { Avatar, Button, Card, DayOneCard, ErrorText, Field, Screen, Spinner } from '@/components';
import { draftToPatch, useDraft } from '@/onboarding/draft';

function labelFor(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

interface Desk {
  groupId: string;
  /** Known when this visit created or joined the group; `null` after a refresh. */
  groupName: string | null;
  /** The first task, if one was written and the create succeeded. */
  taskId: string | null;
  /** Whether the person is alone in it — the "checked by" line depends on it. */
  solo: boolean;
}

/**
 * The end of signup: the answers are written, the desk is built, and the
 * clock is one tap away (§2.9).
 *
 * **The save happens on arrival**, not behind a Finish button. Every answer was
 * given several screens ago, and asking someone to confirm what they already
 * typed is a step that exists for the code's benefit.
 *
 * **Then the desk.** Once the profile is saved, this screen creates the group
 * that will hold the first task — a group of one, named after them — or joins
 * the group they were invited to, and puts the task they typed on `/start/today`
 * into it. That used to be three separate things somebody had to discover after
 * signup: make a group, open it, add a task. The apps that keep people through
 * their first session all do this the same way — Duolingo's first lesson,
 * Strava's first recorded walk — the product's core act happens *before* the
 * person has had to work out where it lives.
 *
 * A group of one is honest, not a hack. §2.4's rollover approves an unreviewed
 * task at rating 0 after a full extra day: the day counts, the streak
 * survives, and it earns nothing because nobody looked. The card says exactly
 * that, and it is the sentence that sends people to the directory.
 *
 * **Idempotent across a refresh.** The group id goes into the draft the moment
 * it exists, so reloading this screen finds the desk rather than building a
 * second one. The task is only created on the visit that created the group,
 * for the same reason. Neither failure blocks: the profile is the thing that
 * matters, and the worst case is landing on the groups tab with a desk to make
 * by hand.
 *
 * The handle is the one thing that can still block the save, and only in one
 * case: someone who registered on the mobile app and never finished lands here
 * already signed in, having skipped `/register`, the only screen that asks for
 * one. Onboarding cannot complete without it, so they get the field and an
 * explicit button; everyone else never sees either.
 */
export default function OnboardingDone() {
  const router = useRouter();
  const draft = useDraft();
  const me = useMe();
  const updateMe = useUpdateMe();
  const uploadAvatar = useUploadAvatar();
  const acceptInvite = useAcceptInviteLink();
  const createGroup = useCreateGroup();
  const createTask = useCreateTask();
  const startTask = useStartTask();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [deskFailed, setDeskFailed] = useState(false);

  /**
   * Only for the signed-in-but-handle-less case above. Everyone who came
   * through /register already claimed one, and is never asked again.
   *
   * Keyed on the *claim*, not on whether the field currently has text in it.
   * Reading the draft here would flip this false on the first keystroke —
   * unmounting the field mid-type and releasing the auto-save to fire with a
   * one-character handle, which the API rejects and which nothing on the
   * resulting screen could then correct.
   */
  const needsHandle = me.data ? !me.data.handleClaimed : false;
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
  const displayName = draft.displayName || me.data?.displayName || 'You';
  const firstName = displayName.trim().split(/\s+/)[0] ?? displayName;

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

  /** Once, after the save — same guard, same reason. */
  const deskBuilt = useRef(false);
  useEffect(() => {
    if (!saved || deskBuilt.current) return;
    deskBuilt.current = true;

    const build = async () => {
      // A refresh: the desk exists, and so does the task if there was one.
      if (draft.dayOneGroupId) {
        setDesk({
          groupId: draft.dayOneGroupId,
          groupName: null,
          taskId: null,
          solo: !draft.inviteToken,
        });
        return;
      }

      let groupId: string;
      let groupName: string;
      let solo: boolean;
      try {
        if (draft.inviteToken) {
          const result = await acceptInvite.mutateAsync(draft.inviteToken);
          groupId = result.group.id;
          groupName = result.group.name;
          solo = false;
        } else {
          const result = await createGroup.mutateAsync({
            name: `${firstName}’s desk`,
            emoji: '🎯',
          });
          groupId = result.group.id;
          groupName = result.group.name;
          solo = true;
        }
      } catch {
        setDeskFailed(true);
        return;
      }
      // Remembered before the task is attempted, so a failure there cannot
      // leave a group that a retry would duplicate.
      draft.set({ dayOneGroupId: groupId });

      let taskId: string | null = null;
      if (draft.firstTask.trim().length > 0) {
        try {
          const result = await createTask.mutateAsync({
            groupId,
            title: draft.firstTask.trim(),
            dueDate: localToday(),
            estimatedMinutes: draft.firstTaskMinutes,
          });
          taskId = result.task.id;
        } catch {
          // The desk is there; the task can be typed again in ten seconds.
        }
      }
      setDesk({ groupId, groupName, taskId, solo });
    };

    void build();
  }, [saved, draft, firstName, acceptInvite, createGroup, createTask]);

  const building = saved && desk === null && !deskFailed;

  /**
   * Leaving clears the draft, and only then: a failed write leaves the answers
   * in place so the save can simply be retried, and the desk id has to survive
   * until the screen is actually done with it.
   */
  const leave = (href: string) => {
    draft.reset();
    router.replace(href);
  };

  const deskHref = desk ? `/groups/${desk.groupId}` : '/groups';

  const startClock = () => {
    if (!desk?.taskId) {
      leave(deskHref);
      return;
    }
    // Either way they land on the desk; if the start failed, the button to
    // try again is the first thing on it.
    startTask.mutate(desk.taskId, { onSettled: () => leave(deskHref) });
  };

  const summary = [level, major, draft.institution.trim()].filter(Boolean).join(' · ');
  const saving = updateMe.isPending;
  const busy = !saved || building || uploadAvatar.isPending || startTask.isPending;

  return (
    <Screen>
      <div className="flex flex-col gap-5 pb-8 pt-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Day one</span>
          <h1 className="text-3xl font-bold leading-tight text-ink">
            {firstName}, your desk is ready
          </h1>
          <p className="text-base text-ink-muted">{summary || 'Your profile is saved.'}</p>
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

        <DayOneCard
          task={draft.firstTask}
          minutes={draft.firstTaskMinutes}
          goalKeys={draft.goalKeys}
          goalText={draft.goalText}
          checkedBy={
            desk && !desk.solo
              ? (desk.groupName ?? 'Your group')
              : draft.inviteToken
                ? 'The group you were invited to'
                : null
          }
        />

        {building ? (
          <p className="flex flex-row items-center gap-2 text-sm text-ink-subtle">
            <Spinner size={14} />
            Setting up your desk…
          </p>
        ) : null}

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

        {deskFailed ? (
          <Card className="border-warning">
            <p className="text-sm text-ink">
              Your profile is saved, but the desk didn&rsquo;t get made. You can create a group
              from the next screen.
            </p>
          </Card>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            label={
              desk?.taskId
                ? 'Start the clock'
                : desk
                  ? 'Go to my desk'
                  : deskFailed
                    ? 'Go to groups'
                    : 'Start the clock'
            }
            onClick={startClock}
            loading={startTask.isPending}
            disabled={busy}
          />
          {desk?.taskId ? (
            <Button
              label="Not yet — show me my desk"
              variant="ghost"
              onClick={() => leave(deskHref)}
              disabled={busy}
            />
          ) : null}
          {desk?.solo ? (
            <Button
              label="Find a buddy"
              variant="ghost"
              onClick={() => leave('/buddies')}
              disabled={busy}
            />
          ) : null}
          {/*
            Precise about *who* can make this task count. A matched buddy lands
            in a new two-person group (§2.2), not on this desk, so "find a buddy
            so it counts" would send someone to do the right thing for the wrong
            task. What makes the desk task count is somebody else at the desk —
            the invite hangs off the member strip there.
          */}
          {desk?.solo ? (
            <p className="text-center text-xs leading-relaxed text-ink-subtle">
              It earns points only when someone else at your desk checks it — invite a friend
              from the desk. Or find a buddy and plan tomorrow together. Either way, finish it:
              the day still counts toward your streak.
            </p>
          ) : null}
        </div>

        {/*
          The photo, last and small. It used to be the centrepiece of this
          screen; it is the least important thing on it, and a directory of
          blank circles is a problem for the directory screen to nag about.
        */}
        <Card>
          <div className="flex flex-row items-center gap-3">
            <Avatar avatarKey={me.data?.avatarKey ?? null} displayName={displayName} size={48} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-sm font-semibold text-ink">
                {uploadAvatar.isSuccess ? 'Looking good' : 'Add a photo'}
              </p>
              <p className="text-xs text-ink-subtle">Optional. Buddies pick faces over circles.</p>
            </div>
            {/*
              Not `Button`: its base classes fix the height at h-12, and a
              smaller `h-9` passed in loses to it on stylesheet order (see
              buttonStyles.ts). A compact control needs its own element.
            */}
            <button
              type="button"
              disabled={uploadAvatar.isPending || (!saved && !uploadAvatar.isSuccess)}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 shrink-0 cursor-pointer rounded-md bg-brand-muted px-3 text-sm font-semibold text-brand transition-colors hover:bg-brand-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadAvatar.isPending ? '…' : uploadAvatar.isSuccess ? 'Change' : 'Choose'}
            </button>
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
      </div>
    </Screen>
  );
}
