'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { MAX_REQUEST_MESSAGE } from '@buddy/shared';

import { useCurrentRequest, useSendRequest } from '@/api/buddies';
import { useBlockUser, useProfile } from '@/api/users';
import {
  BackLink,
  Button,
  Card,
  ConfirmSheet,
  ErrorText,
  Field,
  ProfileView,
  Screen,
  Spinner,
} from '@/components';

/**
 * The full profile a user reads before sending a request (§2.2) — the same
 * `ProfileView` they see of themselves, plus the one thing they can do about
 * this person.
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
  const block = useBlockUser();

  const [message, setMessage] = useState('');
  const [confirmingBlock, setConfirmingBlock] = useState(false);

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
  const hasPending = Boolean(current.data?.request);
  const alreadySent = sendRequest.isSuccess;

  return (
    <Screen>
      <BackLink fallback="/buddies" label="Buddies" />

      <ProfileView
        profile={person}
        actions={
          person.isOpenBuddy ? (
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
              <p className="text-center text-xs text-ink-subtle">
                They have 5 minutes to respond.
              </p>
            </div>
          ) : (
            <Card>
              <p className="text-base text-ink-muted">
                {person.displayName} isn&apos;t taking buddy requests right now.
              </p>
            </Card>
          )
        }
      />

      {/*
        The safety floor (PRODUCT.md §6.1). Quiet, at the bottom, and always
        there: a control that only appears once something has gone wrong is a
        control nobody finds in time.
      */}
      <div className="mt-6 flex flex-col items-center gap-1">
        <Button
          label={`Block ${person.displayName}`}
          variant="ghost"
          className="w-auto"
          onClick={() => setConfirmingBlock(true)}
        />
        <ErrorText message={block.error?.message} />
      </div>

      <ConfirmSheet
        open={confirmingBlock}
        title={`Block ${person.displayName}?`}
        body="You will not see each other in the directory, the feed or in chat, and any request between you lapses. If you share a matched group, you leave it. You can undo this from your settings."
        confirmLabel="Block"
        cancelLabel="Keep them"
        busy={block.isPending}
        onCancel={() => setConfirmingBlock(false)}
        onConfirm={() =>
          block.mutate(person.handle, {
            onSuccess: () => {
              setConfirmingBlock(false);
              router.replace('/buddies');
            },
          })
        }
      />
    </Screen>
  );
}
