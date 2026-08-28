'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { GOALS, MAX_REQUEST_MESSAGE, OCCUPATIONS } from '@buddy/shared';

import { useCurrentRequest, useSendRequest } from '@/api/buddies';
import { useProfile } from '@/api/users';
import { Avatar, BackLink, Button, Card, ErrorText, Field, Screen, Spinner } from '@/components';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

/**
 * The full buddy profile a user reads before sending a request (§2.2).
 *
 * The Request button is disabled while another request is pending, mirroring the
 * server's one-at-a-time rule rather than letting the user hit a 409.
 */
export default function BuddyProfile() {
  const router = useRouter();
  const params = useParams<{ handle: string }>();
  const handle = params.handle;

  const profile = useProfile(handle);
  const current = useCurrentRequest();
  const sendRequest = useSendRequest();

  const [message, setMessage] = useState('');

  if (profile.isPending) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-base text-danger">
            {profile.error?.message ?? "Couldn't load that profile."}
          </p>
          <Button label="Go back" variant="ghost" onClick={() => router.replace('/buddies')} />
        </div>
      </Screen>
    );
  }

  const person = profile.data;
  const goal = person.goalText?.trim() || label(GOALS, person.goalKey);
  const occupation = person.occupationText?.trim() || label(OCCUPATIONS, person.occupationKey);
  const hasPending = Boolean(current.data?.request);
  const alreadySent = sendRequest.isSuccess;

  return (
    <Screen>
      <BackLink fallback="/buddies" label="Buddies" />

      <div className="flex flex-row items-center gap-4">
        <Avatar avatarKey={person.avatarKey} displayName={person.displayName} size={64} />
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-bold text-ink">{person.displayName}</h1>
          <p className="text-base text-ink-subtle">@{person.handle}</p>
        </div>
      </div>

      <Card>
        {goal ? <p className="text-lg text-ink">{goal}</p> : null}
        {occupation ? <p className="text-base text-ink-muted">{occupation}</p> : null}
        {person.buddyProfile?.headline ? (
          <p className="mt-2 text-base italic text-ink-muted">{person.buddyProfile.headline}</p>
        ) : null}
      </Card>

      {person.buddyProfile?.about ? (
        <Card>
          <p className="mb-1 text-sm font-semibold text-ink-muted">About</p>
          <p className="text-base text-ink">{person.buddyProfile.about}</p>
        </Card>
      ) : null}

      {person.buddyProfile?.availability ? (
        <Card>
          <p className="mb-1 text-sm font-semibold text-ink-muted">Usually around</p>
          <p className="text-base text-ink">{person.buddyProfile.availability}</p>
        </Card>
      ) : null}

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Track record</p>
        <p className="text-base text-ink">
          {person.stats.totalCredits} credits · {person.stats.currentStreak} day streak
        </p>
        <p className="text-sm text-ink-muted">
          {person.stats.tasksApproved} tasks approved · {person.stats.reviewsGiven} reviews given
        </p>
        <p className="mt-1 text-xs text-ink-subtle">
          Member since {new Date(person.memberSince).toLocaleDateString()}
        </p>
      </Card>

      {person.badges.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink-muted">Badges</p>
          <div className="flex flex-row flex-wrap gap-2">
            {person.badges.map((badge) => (
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

      {person.isOpenBuddy ? (
        <div className="mt-2 flex flex-col gap-3">
          <Field
            label="Add a message (optional)"
            value={message}
            onChangeText={setMessage}
            maxLength={MAX_REQUEST_MESSAGE}
            placeholder="Want to keep each other honest?"
            disabled={hasPending || alreadySent}
          />
          <ErrorText message={sendRequest.error?.message} />
          <Button
            label={
              alreadySent
                ? 'Request sent'
                : hasPending
                  ? 'You already have a request waiting'
                  : `Ask ${person.displayName} to be your buddy`
            }
            disabled={hasPending || alreadySent || sendRequest.isPending}
            loading={sendRequest.isPending}
            onClick={() =>
              sendRequest.mutate(
                {
                  toUserId: person.id,
                  ...(message.trim() ? { message: message.trim() } : {}),
                },
                // Back to the directory, where the pinned card and countdown live.
                { onSuccess: () => router.replace('/buddies') },
              )
            }
          />
          <p className="text-center text-xs text-ink-subtle">They have 5 minutes to respond.</p>
        </div>
      ) : (
        <Card>
          <p className="text-base text-ink-muted">
            {person.displayName} isn&apos;t taking buddy requests right now.
          </p>
        </Card>
      )}
    </Screen>
  );
}
