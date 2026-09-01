'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useRespondToInvite } from '@/api/groups';
import { useWaitingOnYou } from '@/hooks/useWaitingOnYou';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Sheet } from './Sheet';

/**
 * One place to find everything waiting on you — see `useWaitingOnYou` for what
 * counts and why it needs no table.
 *
 * The three things that need a decision each live on a different screen: a
 * group invite on the Groups tab, a buddy request on Buddies, and a task
 * waiting for your review inside whichever group it belongs to. Nothing tells
 * you any of them exists unless you happen to open that tab, so the push
 * notification was the only thing that ever surfaced them — and a push you
 * swipe away is gone.
 *
 * **It lives on the profile screen, not in a strip above every tab.** A bar
 * pinned over all five screens spent a permanent slice of a phone-sized column
 * on a control that is empty most of the time. The count now rides the Profile
 * tab, which is on screen anyway, and the panel opens from the profile — the
 * same shape the group screen uses for standings, so "an icon in the top-right
 * corner opens a side panel" means one thing throughout the app.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const respond = useRespondToInvite();
  const {
    invites: inviteList,
    requests: requestList,
    reviews: reviewList,
    count,
  } = useWaitingOnYou();

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} waiting` : 'Notifications'}
        onClick={() => setOpen(true)}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-surface-border bg-surface text-ink-muted transition-colors hover:border-brand hover:text-brand"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            d="M18 9a6 6 0 1 0-12 0c0 4.5-1.5 5.5-2 6.5h16c-.5-1-2-2-2-6.5Z"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {/*
        A side panel, not a bottom sheet. The bell answers "what needs me", which
        is a list you scan top-down — a bottom sheet starts that list halfway
        down the screen and grows it upward, so the first item lands wherever the
        last one happened to push it.
      */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Waiting on you"
        placement="side"
      >
        <div className="sticky -top-5 -mx-5 -mt-5 flex flex-row items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
          <h2 className="text-lg font-bold text-ink">
            Waiting on you{count > 0 ? <span className="text-ink-subtle"> · {count}</span> : null}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="-mr-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {count === 0 ? (
          <p className="py-10 text-center text-sm text-ink-subtle">
            Nothing needs you right now.
          </p>
        ) : null}

        {/*
          Buddy requests first, and not because they are the most important —
          because they are the only ones with a clock. A request expires in
          minutes; an invite lasts a week and a review waits for ever.
        */}
        {requestList.map((request) => (
          <Row
            key={request.id}
            avatarKey={request.user.avatarKey}
            displayName={request.user.displayName}
            title={`${request.user.displayName} wants you as a buddy`}
            detail={request.message ?? `@${request.user.handle}`}
            urgent
            action={<Button label="Answer" className="w-auto" onClick={() => go('/buddies')} />}
          />
        ))}

        {inviteList.map((invite) => (
          <Row
            key={invite.id}
            displayName={invite.fromDisplayName}
            title={`${invite.fromDisplayName} invited you to ${invite.groupName}`}
            detail={`@${invite.fromHandle}`}
            action={
              <Button
                label="Join"
                className="w-auto"
                disabled={respond.accept.isPending}
                onClick={() =>
                  respond.accept.mutate(invite.id, {
                    onSuccess: (result) => {
                      if (result.group) go(`/groups/${result.group.id}`);
                    },
                  })
                }
              />
            }
          />
        ))}

        {reviewList.map((task) => (
          <Row
            key={task.id}
            displayName={task.ownerDisplayName}
            title={`${task.ownerDisplayName} is waiting for your review`}
            detail={`${task.title} · ${task.groupName}`}
            action={
              <Button
                label="Review"
                variant="secondary"
                className="w-auto"
                onClick={() => go(`/groups/${task.groupId}`)}
              />
            }
          />
        ))}
      </Sheet>
    </>
  );
}

function Row({
  avatarKey = null,
  displayName,
  title,
  detail,
  action,
  urgent = false,
}: {
  avatarKey?: string | null;
  displayName: string;
  title: string;
  detail: string;
  action: React.ReactNode;
  urgent?: boolean;
}) {
  return (
    <div
      className={`flex flex-row items-center gap-3 rounded-2xl border px-3 py-3 ${
        urgent ? 'border-brand bg-brand-muted' : 'border-surface-border bg-surface'
      }`}
    >
      <Avatar avatarKey={avatarKey} displayName={displayName} size={36} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="truncate text-xs text-ink-muted">{detail}</p>
      </div>
      {action}
    </div>
  );
}
