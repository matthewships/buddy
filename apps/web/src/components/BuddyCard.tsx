'use client';

import type { ReactNode } from 'react';

import { GOALS, OCCUPATIONS } from '@buddy/shared';

import type { BuddyCard as BuddyCardData } from '@/api/buddies';

import { Avatar } from './Avatar';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * A directory card (§2.2). Goal and occupation are the first two lines, because
 * they are the facts a prospective buddy actually decides on.
 *
 * The card is a <button> when it navigates and a plain <div> when it does not —
 * a clickable card that isn't focusable is unreachable by keyboard, and an
 * unclickable one announced as a button is a lie. The action slot on the right
 * sits outside it either way, because a button cannot legally contain a button.
 */
export function BuddyCard({
  buddy,
  onPress,
  right,
}: {
  buddy: BuddyCardData;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const goal = buddy.goalText?.trim() || label(GOALS, buddy.goalKey);
  // The second goal is always the chip label: goalText elaborates the primary
  // goal only, so reusing it here would caption the wrong one.
  const goal2 = label(GOALS, buddy.goalKey2);
  const occupation = buddy.occupationText?.trim() || label(OCCUPATIONS, buddy.occupationKey);
  const isActive = buddy.activity === 'Active now';

  const body = (
    <>
      <Avatar avatarKey={buddy.avatarKey} displayName={buddy.displayName} size={44} />
      <div className="flex flex-1 flex-col text-left">
        <p className="text-lg font-bold text-ink">{buddy.displayName}</p>
        <p className="text-sm text-ink-subtle">@{buddy.handle}</p>

        {goal ? <p className="mt-2 text-base text-ink">{goal}</p> : null}
        {goal2 ? <p className="text-sm text-ink-muted">+ {goal2}</p> : null}
        {occupation ? <p className="text-sm text-ink-muted">{occupation}</p> : null}
        {buddy.headline ? (
          <p className="mt-1 text-sm italic text-ink-muted">{buddy.headline}</p>
        ) : null}

        <div className="mt-2 flex flex-row items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${isActive ? 'bg-success' : 'bg-ink-subtle'}`}
          />
          <p className="text-xs text-ink-subtle">{buddy.activity}</p>
        </div>

        <p className="mt-1 text-xs text-ink-subtle">
          {buddy.stats.totalCredits} credits · {buddy.stats.currentStreak} day streak ·{' '}
          {buddy.stats.reviewsGiven} reviews
        </p>
      </div>
    </>
  );

  return (
    <div className="flex flex-row items-start gap-3 rounded-2xl border border-surface-border bg-surface p-4">
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          aria-label={`${buddy.displayName}, ${[goal ?? 'no goal set', goal2].filter(Boolean).join(', ')}`}
          className="flex flex-1 cursor-pointer flex-row items-start gap-3 text-left hover:opacity-70"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-1 flex-row items-start gap-3">{body}</div>
      )}

      {right}
    </div>
  );
}
