'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { useUploadAvatar } from '@/api/avatar';
import { useMe, useUpdateMe } from '@/api/auth';
import { useDeleteAccount } from '@/api/board';
import { useProfile } from '@/api/users';
import { useSession } from '@/auth/store';
import { useNotificationPreference } from '@/hooks/useNotificationPreference';
import {
  Button,
  Card,
  ConfirmSheet,
  ErrorText,
  ProfileView,
  Screen,
  Spinner,
  Toggle,
} from '@/components';

/**
 * Your own profile — the same `ProfileView` a prospective buddy reads, so what
 * you see here is what you are actually presenting. The differences are all
 * below it: an edit button, and the settings that belong to nobody else.
 */
export default function Profile() {
  const router = useRouter();
  const me = useMe();
  const updateMe = useUpdateMe();
  const signOut = useSession((s) => s.signOut);
  const deleteAccount = useDeleteAccount();
  const uploadAvatar = useUploadAvatar();
  // Stats and badges live on the public profile endpoint, so the same numbers a
  // prospective buddy sees are the ones shown here — no second source of truth.
  const stats = useProfile(me.data?.handle ?? '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const leave = async () => {
    await signOut();
    router.replace('/welcome');
  };

  if (me.isPending) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (me.isError || !me.data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-base text-danger">Couldn&apos;t load your profile.</p>
          <Button label="Try again" variant="ghost" onClick={() => void me.refetch()} />
        </div>
      </Screen>
    );
  }

  const profile = me.data;

  // The whole profile comes from the public endpoint, so this screen and a
  // stranger's view of it cannot disagree. While it loads, the /me data still
  // fills the header.
  if (stats.isPending || !stats.data) {
    return (
      <Screen>
        <h1 className="mb-1 mt-2 text-2xl font-bold text-ink">Profile</h1>
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {/*
        Editing lives in the corner, not under the profile. Two full-width
        buttons — "Edit profile" and "Change photo" — were the first thing the
        screen said about a person, above their own name, and neither is
        something anyone opens this screen to do.
      */}
      <div className="flex flex-row items-center justify-end">
        <button
          type="button"
          aria-label="Edit your profile"
          title="Edit profile"
          onClick={() => router.push('/profile/edit')}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-surface-border bg-surface text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
          </svg>
        </button>
      </div>

      <ProfileView
        profile={stats.data}
        onChangePhoto={() => fileInputRef.current?.click()}
        changingPhoto={uploadAvatar.isPending}
        banner={
          <div className="flex flex-col gap-3">
            {/*
              The mobile screen calls expo-image-picker, which opens the OS
              picker directly. The web equivalent is a hidden file input driven
              by the avatar itself, so it stays keyboard-reachable and the
              browser still applies its own file dialog.
            */}
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

            {!profile.institution || !profile.educationLevel ? (
              <Card>
                <p className="text-base text-ink">Your profile is missing a few things.</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Level of study and where you study are what the directory matches on — without
                  them, fewer people will find you.
                </p>
              </Card>
            ) : null}
          </div>
        }
      />

      <Card>
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-1 flex-col">
            <p className="text-base font-semibold text-ink">Open to buddy requests</p>
            <p className="text-sm text-ink-muted">
              {profile.isOpenBuddy
                ? 'You appear in the buddy directory.'
                : 'You are hidden from the directory.'}
            </p>
          </div>
          <Toggle
            checked={profile.isOpenBuddy}
            onChange={(isOpenBuddy) => {
              if (!updateMe.isPending) updateMe.mutate({ isOpenBuddy });
            }}
            label="Open to buddy requests"
          />
        </div>
      </Card>

      <NotificationCard />

      <div className="mt-2 flex flex-col gap-3">
        <Button label="Sign out" variant="ghost" onClick={() => void leave()} />

        {/* Required by both app stores (§4.3). Confirmed first, because it
            cannot be undone from inside the app. */}
        <Button
          label="Delete account"
          variant="danger"
          disabled={deleteAccount.isPending}
          onClick={() => setConfirmingDelete(true)}
        />
        <ErrorText message={deleteAccount.error?.message} />
      </div>

      <ConfirmSheet
        open={confirmingDelete}
        title="Delete your account?"
        body="Your profile, tasks and buddy connections are removed. Messages and reviews you left stay in your groups without your name. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep my account"
        busy={deleteAccount.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          deleteAccount.mutate(undefined, {
            onSuccess: () => {
              setConfirmingDelete(false);
              void leave();
            },
          })
        }
      />
    </Screen>
  );
}

/**
 * Browser notifications.
 *
 * A control rather than something the app arranges by itself: browsers only
 * allow `Notification.requestPermission()` from a user gesture, and prompting on
 * page load is penalised — some browsers auto-deny it outright, which would burn
 * the one chance there is, since a denied permission can never be re-asked from
 * the page.
 *
 * The three real permission states are reported as they are. The wish and the
 * permission are separate (see hooks/useNotificationPreference.ts), so a granted
 * permission with the feature switched off honestly reads as off.
 *
 * The copy also distinguishes the two mechanisms behind the one switch, because
 * they behave very differently: with a push subscription every notification
 * arrives with the site closed, and without one only buddy requests arrive, only
 * while a tab is open.
 */
function NotificationCard() {
  const notifications = useNotificationPreference();

  // Everything here is read from `window` in an effect, because these routes are
  // prerendered without one. Until that effect has run there is nothing true to
  // say, and guessing would be a hydration mismatch.
  if (notifications.state === 'unknown') return null;

  return (
    <Card>
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-1 flex-col">
          <p className="text-base font-semibold text-ink">Notifications</p>

          {notifications.state === 'granted' ? (
            <p className="text-sm text-ink-muted">
              {notifications.enabled
                ? notifications.pushActive
                  ? 'On: buddy requests, invites, reviews and chat reach you even with Buddy closed.'
                  : 'On for buddy requests, while a Buddy tab is open.'
                : 'Notifications are allowed, but turned off here.'}
            </p>
          ) : null}

          {notifications.state === 'default' ? (
            <p className="text-sm text-ink-muted">
              Get notified about buddy requests, group invites, task reviews and chat — the same
              alerts the app sends. A buddy request expires in 5 minutes, so a missed one is a
              lost one.
            </p>
          ) : null}

          {notifications.state === 'denied' ? (
            <p className="text-sm text-warning">
              Your browser is blocking notifications for Buddy. This page cannot ask again — turn
              them back on in your browser&apos;s site settings for this address.
            </p>
          ) : null}

          {notifications.state === 'unsupported' ? (
            <>
              <p className="text-sm text-ink-subtle">This browser cannot show notifications.</p>
              {/*
                Where this actually lands: Safari on iOS has no `Notification`
                in a normal tab, so it reports `unsupported` and never reaches
                the `default` state the other hint is attached to. Without this
                line, the one platform with a fix is the one that never sees it.
              */}
              <p className="mt-2 text-xs text-ink-subtle">
                On an iPhone or iPad, add Buddy to your Home Screen and open it from there —
                Safari only offers notifications to an installed app.
              </p>
            </>
          ) : null}

          {/* Which of the two mechanisms is actually running, said plainly
              rather than discovered later. */}
          {notifications.state === 'granted' && notifications.enabled && !notifications.pushActive ? (
            <p className="mt-2 text-xs text-ink-subtle">
              This browser could not subscribe to push, so alerts arrive only while a Buddy tab is
              open. On an iPhone, add Buddy to your Home Screen and open it from there — Safari
              only allows push for an installed app.
            </p>
          ) : null}

          {notifications.state === 'default' ? (
            <p className="mt-2 text-xs text-ink-subtle">
              The in-app banner shows a buddy request whenever Buddy is on screen, with or
              without this.
            </p>
          ) : null}
        </div>

        {notifications.state === 'granted' ? (
          <Toggle
            checked={notifications.enabled}
            onChange={notifications.setEnabled}
            label="Buddy request alerts"
          />
        ) : null}
      </div>

      {notifications.state === 'default' ? (
        <Button
          label="Enable notifications"
          variant="secondary"
          loading={notifications.busy}
          onClick={() => void notifications.enable()}
          className="mt-3 w-auto self-start"
        />
      ) : null}
    </Card>
  );
}
