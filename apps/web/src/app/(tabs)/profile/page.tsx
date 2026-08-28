'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { GOALS, OCCUPATIONS } from '@buddy/shared';

import { useUploadAvatar } from '@/api/avatar';
import { useMe, useUpdateMe } from '@/api/auth';
import { useDeleteAccount } from '@/api/board';
import { useProfile } from '@/api/users';
import { useSession } from '@/auth/store';
import { useNotificationPreference } from '@/hooks/useNotificationPreference';
import {
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  ErrorText,
  Screen,
  Spinner,
  Toggle,
} from '@/components';

function labelFor(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

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
  const goal = profile.goalText?.trim() || labelFor(GOALS, profile.goalKey);
  const occupation = profile.occupationText?.trim() || labelFor(OCCUPATIONS, profile.occupationKey);

  return (
    <Screen>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-ink">Profile</h1>

      <Card>
        <div className="flex flex-row items-center gap-4">
          {/*
            The mobile screen calls expo-image-picker, which opens the OS picker
            directly. The web equivalent is a hidden file input driven by a real
            button, so it stays keyboard-reachable and the browser still applies
            its own file dialog.
          */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              aria-label="Change your photo"
              disabled={uploadAvatar.isPending}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              <Avatar avatarKey={profile.avatarKey} displayName={profile.displayName} size={72} />
              <span className="mt-1 block text-center text-xs text-brand">
                {uploadAvatar.isPending ? 'Uploading…' : 'Change'}
              </span>
            </button>
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
          </div>

          <div className="flex flex-1 flex-col">
            <p className="text-xl font-bold text-ink">{profile.displayName}</p>
            <p className="text-base text-ink-muted">@{profile.handle}</p>
            {goal ? <p className="mt-2 text-base text-ink">{goal}</p> : null}
            {occupation ? <p className="text-sm text-ink-muted">{occupation}</p> : null}
          </div>
        </div>
        <ErrorText message={uploadAvatar.error?.message} />
      </Card>

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

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Stats</p>
        {stats.isPending ? (
          <Spinner />
        ) : stats.data ? (
          <>
            <div className="flex flex-row justify-between">
              <StatBlock label="Credits" value={stats.data.stats.totalCredits} />
              <StatBlock label="Streak" value={`${stats.data.stats.currentStreak}d`} />
              <StatBlock label="Best" value={`${stats.data.stats.bestStreak}d`} />
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              {stats.data.stats.tasksApproved} tasks approved · {stats.data.stats.reviewsGiven}{' '}
              reviews given
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-subtle">Stats aren&apos;t available right now.</p>
        )}
      </Card>

      {(stats.data?.badges.length ?? 0) > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink-muted">Badges</p>
          <div className="flex flex-row flex-wrap gap-2">
            {stats.data?.badges.map((badge) => (
              <span
                key={badge.key}
                className="rounded-full border border-surface-border bg-surface-muted px-3 py-1.5 text-xs text-ink"
              >
                {badge.emoji} {badge.name}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

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
 * Browser notifications for incoming buddy requests.
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
          <p className="text-base font-semibold text-ink">Buddy request alerts</p>

          {notifications.state === 'granted' ? (
            <p className="text-sm text-ink-muted">
              {notifications.enabled
                ? 'Your browser will notify you when a request arrives while you are on another tab.'
                : 'Notifications are allowed, but turned off here.'}
            </p>
          ) : null}

          {notifications.state === 'default' ? (
            <p className="text-sm text-ink-muted">
              Get notified when a buddy request arrives while you are on another tab. A request
              expires in 5 minutes, so a missed one is a lost one.
            </p>
          ) : null}

          {notifications.state === 'denied' ? (
            <p className="text-sm text-warning">
              Your browser is blocking notifications for Buddy. This page cannot ask again — turn
              them back on in your browser&apos;s site settings for this address.
            </p>
          ) : null}

          {notifications.state === 'unsupported' ? (
            <p className="text-sm text-ink-subtle">This browser cannot show notifications.</p>
          ) : null}

          {/* Said plainly rather than discovered later: this is a tab-bound,
              desktop-first fallback, not push. */}
          {notifications.state === 'granted' || notifications.state === 'default' ? (
            <p className="mt-2 text-xs text-ink-subtle">
              Only works while a Buddy tab is open, and not at all in Chrome on Android. The
              in-app banner and the 15-second check are unaffected either way.
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

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-ink-subtle">{label}</p>
    </div>
  );
}
