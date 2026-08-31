'use client';

import { useState } from 'react';

import {
  COUNTRIES,
  EDUCATION_LEVELS,
  GOALS,
  INTERESTS,
  MAX_REQUEST_MESSAGE,
  MAJORS,
  TOPICS,
} from '@buddy/shared';

import type { BuddyCard as BuddyCardData } from '@/api/buddies';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Field } from './Field';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/** Up to three chips: the card is a summary, and a wall of tags is not scannable. */
const MAX_CHIPS = 3;

function chipLabels(
  topics: readonly string[],
  interests: readonly string[],
): { key: string; text: string }[] {
  // Topics first: they are the closest thing on a card to "what we would
  // actually talk about", and hobbies fill whatever room is left.
  return [
    ...topics.map((key) => ({ key: `t:${key}`, text: label(TOPICS, key) ?? key })),
    ...interests.map((key) => ({ key: `i:${key}`, text: label(INTERESTS, key) ?? key })),
  ].slice(0, MAX_CHIPS);
}

/**
 * A directory card, in the shape Unibuddy's Connect list uses: who someone is
 * on the left, and the one action you might take about them on the right.
 *
 * The action is Request rather than Unibuddy's Message, and it expands in place
 * into a composer rather than navigating: adding a note is the difference
 * between a request that reads as a cold tap and one that reads as a person, so
 * it should not cost a screen. Nothing about the request *rules* changes — one
 * pending at a time, five-minute expiry — and while one is pending every button
 * here is disabled, because the API allows one and the UI should say so rather
 * than let the user discover it through a 409.
 *
 * The card body is a <button> when it navigates and a plain <div> when it does
 * not: a clickable card that isn't focusable is unreachable by keyboard, and an
 * unclickable one announced as a button is a lie. The action sits outside it
 * either way, because a button cannot legally contain a button.
 */
export function BuddyCard({
  buddy,
  onPress,
  onRequest,
  requestDisabled = false,
  requestDisabledReason,
  busy = false,
}: {
  buddy: BuddyCardData;
  onPress?: () => void;
  /** Omitted where requesting makes no sense — the pinned card, say. */
  onRequest?: (message: string) => void;
  requestDisabled?: boolean;
  requestDisabledReason?: string;
  busy?: boolean;
}) {
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState('');

  const goal = buddy.goalText?.trim() || label(GOALS, buddy.goalKey);
  // The second goal is always the chip label: goalText elaborates the primary
  // goal only, so reusing it here would caption the wrong one.
  const goal2 = label(GOALS, buddy.goalKey2);
  const level = label(EDUCATION_LEVELS, buddy.educationLevel);
  const major = buddy.majorText?.trim() || label(MAJORS, buddy.majorKey);
  const from = label(COUNTRIES, buddy.country);
  const chips = chipLabels(buddy.topics, buddy.interests);
  const isActive = buddy.activity === 'Active now';

  // "Master's · Physics" reads as one fact, so it is one line; either half
  // alone still works.
  const study = [level, major].filter(Boolean).join(' · ');
  const place = [buddy.institution, from].filter(Boolean).join(' · ');

  const body = (
    <>
      <Avatar avatarKey={buddy.avatarKey} displayName={buddy.displayName} size={48} />
      <div className="flex flex-1 flex-col text-left">
        <p className="text-lg font-bold text-ink">{buddy.displayName}</p>
        <p className="text-sm text-ink-subtle">@{buddy.handle}</p>

        {study ? <p className="mt-1.5 text-sm font-medium text-ink">{study}</p> : null}
        {place ? <p className="text-sm text-ink-muted">{place}</p> : null}

        {goal ? <p className="mt-2 text-base text-ink">{goal}</p> : null}
        {goal2 ? <p className="text-sm text-ink-muted">+ {goal2}</p> : null}
        {buddy.headline ? (
          <p className="mt-1 text-sm italic text-ink-muted">{buddy.headline}</p>
        ) : null}

        {chips.length > 0 ? (
          <div className="mt-2 flex flex-row flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="rounded-full border border-surface-border bg-surface-muted px-2.5 py-1 text-xs text-ink-muted"
              >
                {chip.text}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex flex-row items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${isActive ? 'bg-success' : 'bg-ink-subtle'}`}
          />
          <p className="text-xs text-ink-subtle">{buddy.activity}</p>
        </div>

        <p className="mt-1 text-xs text-ink-subtle">
          {buddy.stats.totalCredits} points · {buddy.stats.currentStreak} day streak ·{' '}
          {buddy.stats.reviewsGiven} reviews
        </p>
      </div>
    </>
  );

  const send = () => {
    onRequest?.(message.trim());
    setComposing(false);
    setMessage('');
  };

  return (
    <div className="flex flex-col rounded-2xl border border-surface-border bg-surface p-4">
      <div className="flex flex-row items-start gap-3">
        {onPress ? (
          <button
            type="button"
            onClick={onPress}
            aria-label={`${buddy.displayName}, ${[study, goal ?? 'no goal set'].filter(Boolean).join(', ')}`}
            className="flex flex-1 cursor-pointer flex-row items-start gap-3 text-left hover:opacity-70"
          >
            {body}
          </button>
        ) : (
          <div className="flex flex-1 flex-row items-start gap-3">{body}</div>
        )}
      </div>

      {onRequest ? (
        <div className="mt-3 border-t border-surface-border pt-3">
          {composing ? (
            <div className="flex flex-col gap-2">
              <Field
                label={`Say something to ${buddy.displayName} (optional)`}
                value={message}
                onChangeText={setMessage}
                maxLength={MAX_REQUEST_MESSAGE}
                hint={`${message.length}/${MAX_REQUEST_MESSAGE} · they have 5 minutes to reply`}
                placeholder="Want to keep each other honest?"
                autoFocus
                onSubmit={send}
              />
              <div className="flex flex-row gap-2">
                <Button label="Send request" onClick={send} disabled={busy} loading={busy} />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onClick={() => {
                    setComposing(false);
                    setMessage('');
                  }}
                />
              </div>
            </div>
          ) : (
            <Button
              label={requestDisabled ? (requestDisabledReason ?? 'Request') : 'Request'}
              variant="ghost"
              disabled={requestDisabled || busy}
              onClick={() => setComposing(true)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
