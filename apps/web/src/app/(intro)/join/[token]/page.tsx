'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAcceptInviteLink, useInvitePreview } from '@/api/invite-links';
import { useSession } from '@/auth/store';
import { Button, Card, LoadingScreen, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';
import { FIRST_STEP } from '@/onboarding/steps';

/**
 * Where a join link lands (§2.3).
 *
 * The screen exists because of what comes *after* it. Someone arriving from a
 * WhatsApp message is one tap into a product they have never heard of, and the
 * next thing Buddy asks of them is nine questions, an email address and a
 * password. Showing the group and who invited them first is what makes that ask
 * reasonable — which is why the preview endpoint is unauthenticated.
 *
 * Signed in: join and go. Signed out: the token goes into the signup draft,
 * survives the whole questionnaire in sessionStorage, and is redeemed at the end
 * so they land in the group rather than on a generic home screen.
 */
export default function JoinPage() {
  const router = useRouter();
  const token = useParams<{ token: string }>().token;

  const preview = useInvitePreview(token);
  const accept = useAcceptInviteLink();
  const status = useSession((s) => s.status);
  const setDraft = useDraft((d) => d.set);

  const signedIn = status === 'signedIn';

  // Remembered as soon as the page opens, not when the button is pressed: a
  // visitor who wanders off to read about the app and comes back through
  // another route should still end up in the group they were invited to.
  useEffect(() => {
    if (!signedIn && preview.data) setDraft({ inviteToken: token });
  }, [preview.data, setDraft, signedIn, token]);

  if (status === 'loading' || preview.isPending) return <LoadingScreen />;

  if (preview.isError || !preview.data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col justify-center gap-3">
          <h1 className="text-3xl font-bold text-ink">That link doesn&apos;t work</h1>
          <p className="text-base text-ink-muted">
            {preview.error?.message ??
              'It may have expired, been used up, or been withdrawn. Ask whoever sent it for a new one.'}
          </p>
          <div className="mt-6">
            <Button label="Look around instead" onClick={() => router.replace('/welcome')} />
          </div>
        </div>
      </Screen>
    );
  }

  const { group, invitedBy } = preview.data;

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-base text-ink-muted">{invitedBy} invited you to</p>
        <h1 className="text-4xl font-bold text-ink">
          {group.emoji ? `${group.emoji} ` : ''}
          {group.name}
        </h1>

        <Card>
          <p className="text-base text-ink">
            Buddy is where students plan what they&apos;ll finish today and have someone in the
            group check it off.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {signedIn
              ? 'You already have an account — this takes one tap.'
              : 'Setting up takes a couple of minutes. Your place in the group is saved until you finish.'}
          </p>
        </Card>

        {accept.error ? <p className="text-base text-danger">{accept.error.message}</p> : null}

        <div className="mt-2 flex flex-col gap-3">
          <Button
            label={signedIn ? `Join ${group.name}` : 'Join — set up my account'}
            loading={accept.isPending}
            onClick={() => {
              if (!signedIn) {
                router.push(FIRST_STEP);
                return;
              }
              accept.mutate(token, {
                onSuccess: (result) => router.replace(`/groups/${result.group.id}`),
              });
            }}
          />
          {!signedIn ? (
            <Button
              label="I already have an account"
              variant="ghost"
              onClick={() => router.push('/login')}
            />
          ) : null}
        </div>
      </div>
    </Screen>
  );
}
