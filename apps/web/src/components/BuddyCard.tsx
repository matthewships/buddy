'use client';

import { useState } from 'react';

import { COUNTRIES, EDUCATION_LEVELS, MAX_REQUEST_MESSAGE, MAJORS } from '@buddy/shared';

import type { BuddyCard as BuddyCardData } from '@/api/buddies';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Field } from './Field';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * A directory card: a photo, a name, and the four facts that place someone.
 *
 * It used to carry everything the API returned — goal, second goal, headline,
 * three tag chips, an activity dot, points, streak and review count — which
 * made every card a paragraph and the list a wall. Nine facts about a stranger
 * are not twice as useful as four; they are harder to read than four, and they
 * pushed the photo down to a thumbnail with no room to be a face.
 *
 * So the card answers "who is this, and are they like me?" — level, field,
 * university, country — and `… more` opens the profile, where the goal, the
 * hobbies and the track record already live in full. The photo takes the space
 * that bought, because a face is the fastest thing on a card to read.
 *
 * The action is Request rather than a Message button, and it expands in place
 * into a composer rather than navigating: adding a note is the difference
 * between a request that reads as a cold tap and one that reads as a person, so
 * it should not cost a screen. Nothing about the request *rules* changes — one
 * pending at a time, five-minute expiry — and while one is pending every button
 * here is disabled, because the API allows one and the UI should say so rather
 * than let the user discover it through a 409.
 *
 * The card body is a <button> when it navigates and a plain <div> when it does
 * not: a clickable card that isn't focusable is unreachable by keyboard, and an
 * unclickable one announced as a button is a lie. `… more` is a span inside
 * that button rather than a link beside it — it names what the card's own click
 * target does, and a button cannot legally contain a button.
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

  const level = label(EDUCATION_LEVELS, buddy.educationLevel);
  const major = buddy.majorText?.trim() || label(MAJORS, buddy.majorKey);
  const from = label(COUNTRIES, buddy.country);

  // "PhD · Business / Management" reads as one fact, so it is one line; either
  // half alone still works. Same for "University of Guelph · Canada".
  const study = [level, major].filter(Boolean).join(' · ');
  const place = [buddy.institution, from].filter(Boolean).join(' · ');

  const body = (
    <>
      <Avatar avatarKey={buddy.avatarKey} displayName={buddy.displayName} size={72} />
      <div className="flex min-w-0 flex-1 flex-col text-left">
        <p className="truncate text-lg font-bold text-ink">{buddy.displayName}</p>
        <p className="truncate text-sm text-ink-subtle">@{buddy.handle}</p>

        {study ? <p className="mt-2 text-sm font-medium text-ink">{study}</p> : null}
        {place ? <p className="text-sm text-ink-muted">{place}</p> : null}

        {onPress ? <span className="mt-1.5 text-sm font-semibold text-brand">… more</span> : null}
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
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          aria-label={`${buddy.displayName}, ${
            [study, place].filter(Boolean).join(', ') || 'no details yet'
          } — open profile`}
          className="flex cursor-pointer flex-row items-center gap-4 text-left transition-opacity hover:opacity-70"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-row items-center gap-4">{body}</div>
      )}

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
