'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { useUploadAvatar } from '@/api/avatar';
import { useMe, useUpdateMe } from '@/api/auth';
import { useDeleteAccount } from '@/api/board';
import { useDeclareRestDay, useRestDays } from '@/api/sessions';
import { useBlocks, useProfile, useUnblockUser } from '@/api/users';
import { useSession } from '@/auth/store';
import { useNotificationPreference } from '@/hooks/useNotificationPreference';
import {
  Avatar,
  Button,
  ConfirmSheet,
  ErrorText,
  GetFoundCard,
  IconButton,
  NotificationBell,
  ProfileView,
  Screen,
  Sheet,
  Spinner,
  Toggle,
} from '@/components';

/**
 * Your own profile — the same `ProfileView` a prospective buddy reads, so what
 * you see here is what you are actually presenting.
 *
 * Everything that is *yours* rather than *you* now lives in the top-right
 * corner: what needs you, editing, and the switches. The switches used to be
 * two full-width cards stacked under the profile, so the screen that answers
 * "how am I doing" spent half its length on two settings nobody changes twice.
 * The corner is the same row of controls the group screen has, in the same
 * place, doing the same thing.
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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

        The bell sits to its left, and settings to its right, matching the
        group screen: read-something first, then act-on-something, then the
        knobs.
      */}
      <div className="flex flex-row items-center justify-end gap-1">
        <NotificationBell />
        <IconButton
          label="Edit profile"
          onClick={() => router.push('/profile/edit')}
          glyph={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
            </svg>
          }
        />
        <IconButton
          label="Settings"
          onClick={() => setSettingsOpen(true)}
          glyph={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="3" />
              <path
                d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                strokeLinecap="round"
              />
            </svg>
          }
        />
      </div>

      <ProfileView
        profile={stats.data}
        onChangePhoto={() => fileInputRef.current?.click()}
        changingPhoto={uploadAvatar.isPending}
        showBadgeProgress
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

            <GetFoundCard profile={profile} compact />
          </div>
        }
      />

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

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isOpenBuddy={profile.isOpenBuddy}
        onOpenBuddyChange={(isOpenBuddy) => {
          if (!updateMe.isPending) updateMe.mutate({ isOpenBuddy });
        }}
        quietHours={{ start: profile.quietHoursStart, end: profile.quietHoursEnd }}
        onQuietHoursChange={(start, end) => {
          if (!updateMe.isPending) updateMe.mutate({ quietHoursStart: start, quietHoursEnd: end });
        }}
      />

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
 * The switches, behind the gear.
 *
 * Both were full-width cards on the profile itself, which put "You are hidden
 * from the directory" between someone's badges and the button they came here
 * for. Neither is touched more than once or twice in an account's life, and a
 * sheet is where a rarely-touched switch belongs — the same reasoning that took
 * the group's Buddy rule off the group screen.
 *
 * Bottom placement, matching the group's settings sheet: this is a panel you
 * operate rather than a list you scan, and the two should not open differently.
 */
function SettingsSheet({
  open,
  onClose,
  isOpenBuddy,
  onOpenBuddyChange,
  quietHours,
  onQuietHoursChange,
}: {
  open: boolean;
  onClose: () => void;
  isOpenBuddy: boolean;
  /** The caller drops a change made while one is already in flight. */
  onOpenBuddyChange: (value: boolean) => void;
  quietHours: { start: number; end: number };
  onQuietHoursChange: (start: number, end: number) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Settings</h2>
        <Button label="Close" variant="ghost" className="w-auto" onClick={onClose} />
      </div>

      <div className="flex flex-row items-center justify-between gap-4 border-t border-surface-border pt-4">
        <div className="flex flex-1 flex-col">
          <p className="text-base font-semibold text-ink">Open to buddy requests</p>
          <p className="text-sm text-ink-muted">
            {isOpenBuddy
              ? 'You appear in the buddy directory.'
              : 'You are hidden from the directory.'}
          </p>
        </div>
        <Toggle
          checked={isOpenBuddy}
          onChange={onOpenBuddyChange}
          label="Open to buddy requests"
        />
      </div>

      {/* Rendered only while the sheet is open, so the permission state is read
          fresh each time rather than from whatever it was on page load. */}
      {open ? <NotificationSettings /> : null}

      <QuietHoursSettings value={quietHours} onChange={onQuietHoursChange} />

      {open ? <RestDaySettings /> : null}

      {open ? <BlockedList /> : null}
    </Sheet>
  );
}

/**
 * Quiet hours (PRODUCT.md §5.3): the local window in which nothing nudges.
 * Two native selects rather than a custom control — a clock is a list of
 * twenty-four things, and the browser's own picker handles that on every
 * platform, keyboard included. Chat and buddy requests are people reaching
 * out and are not silenced; the copy says so.
 */
function QuietHoursSettings({
  value,
  onChange,
}: {
  value: { start: number; end: number };
  onChange: (start: number, end: number) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const label = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  const select = 'h-10 rounded-md border border-surface-border bg-surface px-2 text-base text-ink';

  return (
    <div className="flex flex-col gap-2 border-t border-surface-border pt-4">
      <p className="text-base font-semibold text-ink">Quiet hours</p>
      <p className="text-sm text-ink-muted">
        No nudges between these hours, your time. Buddy requests and chat still reach you.
      </p>
      <div className="flex flex-row items-center gap-2">
        <label className="flex flex-row items-center gap-2 text-sm text-ink-muted">
          From
          <select
            className={select}
            value={value.start}
            onChange={(event) => onChange(Number(event.target.value), value.end)}
          >
            {hours.map((hour) => (
              <option key={hour} value={hour}>
                {label(hour)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-row items-center gap-2 text-sm text-ink-muted">
          to
          <select
            className={select}
            value={value.end}
            onChange={(event) => onChange(value.start, Number(event.target.value))}
          >
            {hours.map((hour) => (
              <option key={hour} value={hour}>
                {label(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * Rest days and freezes (PRODUCT.md §3.6): the days the streak forgives.
 * Today and tomorrow are offered, because that is the horizon anyone plans a
 * day off on; freezes are shown, not spent — the rollover spends them.
 */
function RestDaySettings() {
  const rest = useRestDays();
  const declare = useDeclareRestDay();
  const data = rest.data;
  if (!data) return null;

  const tomorrow = (() => {
    const t = new Date(`${data.today}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  })();
  const days = [
    { date: data.today, label: 'Today' },
    { date: tomorrow, label: 'Tomorrow' },
  ];

  return (
    <div className="flex flex-col gap-2 border-t border-surface-border pt-4">
      <p className="text-base font-semibold text-ink">Rest days</p>
      <p className="text-sm text-ink-muted">
        A rest day does not break your streak. {data.maxPerWeek} a week, declared before the day.
        You also have {data.freezesAvailable} freeze{data.freezesAvailable === 1 ? '' : 's'} this month,
        spent for you on a day you miss.
      </p>
      <div className="flex flex-row gap-2">
        {days.map((day) => {
          const declared = data.restDays.includes(day.date);
          return (
            <Button
              key={day.date}
              label={declared ? `${day.label}: resting` : `Rest ${day.label.toLowerCase()}`}
              variant={declared ? 'primary' : 'ghost'}
              className="flex-1"
              loading={declare.isPending && declare.variables?.date === day.date}
              onClick={() => declare.mutate({ date: day.date, declared: !declared })}
            />
          );
        })}
      </div>
      <p className="text-xs text-ink-subtle">
        {data.usedThisWeek} of {data.maxPerWeek} used this week.
      </p>
      <ErrorText message={declare.error?.message} />
    </div>
  );
}

/** Everyone the caller has blocked, and the way to undo it (PRODUCT.md §6.1). */
function BlockedList() {
  const blocks = useBlocks();
  const unblock = useUnblockUser();
  const list = blocks.data?.blocks ?? [];

  return (
    <div className="flex flex-col gap-2 border-t border-surface-border pt-4">
      <p className="text-base font-semibold text-ink">Blocked</p>
      {blocks.isPending ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody. Block someone from their profile.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-border">
          {list.map((person) => (
            <li key={person.id} className="flex flex-row items-center gap-3 py-2">
              <Avatar avatarKey={person.avatarKey} displayName={person.displayName} size={32} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-ink">{person.displayName}</span>
                <span className="text-xs text-ink-subtle">@{person.handle}</span>
              </div>
              <Button
                label="Unblock"
                variant="ghost"
                className="w-auto"
                loading={unblock.isPending && unblock.variables === person.handle}
                onClick={() => unblock.mutate(person.handle)}
              />
            </li>
          ))}
        </ul>
      )}
      <ErrorText message={unblock.error?.message} />
    </div>
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
function NotificationSettings() {
  const notifications = useNotificationPreference();

  // Everything here is read from `window` in an effect, because these routes are
  // prerendered without one. Until that effect has run there is nothing true to
  // say, and guessing would be a hydration mismatch.
  if (notifications.state === 'unknown') return null;

  return (
    // A bordered section rather than a Card: inside the sheet a card would draw
    // a box within a box, and the divider is what separates it from the switch
    // above.
    <div className="flex flex-col border-t border-surface-border pt-4">
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-1 flex-col">
          <p className="text-base font-semibold text-ink">Notifications</p>

          {notifications.state === 'granted' ? (
            <p className="text-sm text-ink-muted">
              {notifications.enabled
                ? notifications.pushActive
                  ? 'On: buddy requests, invites, reviews, chat and the morning nudge reach you even with Buddy closed.'
                  : 'On for buddy requests, while a Buddy tab is open.'
                : 'Notifications are allowed, but turned off here.'}
            </p>
          ) : null}

          {notifications.state === 'default' ? (
            <p className="text-sm text-ink-muted">
              Get notified about buddy requests, group invites, task reviews, chat, and a nudge
              at 8am on a morning with nothing planned — the same alerts the app sends. A buddy
              request expires in 5 minutes, so a missed one is a lost one.
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
    </div>
  );
}
