'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useMe } from '@/api/auth';
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
 * Three arrivals, and the whole flow turns on telling them apart:
 *
 * - **Onboarded and signed in** — the common case, a friend forwarding a link
 *   to someone already on Buddy. One tap, straight into the group.
 * - **Signed out** — the token goes into the signup draft, survives the whole
 *   questionnaire and the mail round trip in sessionStorage, and is redeemed at
 *   `/onboarding/done` so they land in the group rather than on a generic home
 *   screen.
 * - **Signed in but unonboarded** — sent to finish the questions, *not* joined
 *   on the spot: every group screen requires onboarding, so joining first would
 *   drop them into a room they are immediately bounced out of.
 */
export default function JoinPage() {
  const router = useRouter();
  const token = useParams<{ token: string }>().token;

  const preview = useInvitePreview(token);
  const accept = useAcceptInviteLink();
  const status = useSession((s) => s.status);
  const cachedOnboarded = useSession((s) => s.onboarded);
  const me = useMe();
  const setDraft = useDraft((d) => d.set);

  const signedIn = status === 'signedIn';
  const onboarded = me.data?.onboarded ?? cachedOnboarded;
  // Same rule as the route guards: don't decide until /me has answered, unless
  // the cached flag already says onboarded and there is nothing to wait for.
  const deciding = status === 'loading' || (signedIn && me.isPending && !cachedOnboarded);

  /**
   * Remembered as soon as the page opens, not when the button is pressed: a
   * visitor who wanders off to read about the app and comes back through
   * another route should still end up in the group they were invited to.
   *
   * Stored for a signed-in visitor too, not just a signed-out one. It is what
   * carries an unonboarded user through the questions, and it is what sends
   * someone who taps "I already have an account" back here after they log in.
   * Redemption clears it, so nothing stale is left behind.
   */
  useEffect(() => {
    if (preview.data) setDraft({ inviteToken: token });
  }, [preview.data, setDraft, token]);

  if (deciding || preview.isPending) return <LoadingScreen />;

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
            <Button
              label={signedIn ? 'Go to my groups' : 'Look around instead'}
              onClick={() => router.replace(signedIn ? '/groups' : '/welcome')}
            />
          </div>
        </div>
      </Screen>
    );
  }

  const { group, invitedBy } = preview.data;
  const ready = signedIn && onboarded;

  const enter = () => {
    // Not signed in: the token is already in the draft, and the questions are
    // the way in. Signed in but unonboarded: the same, from wherever they left
    // off — `/onboarding/done` redeems the token once the profile is written.
    if (!ready) {
      router.push(FIRST_STEP);
      return;
    }
    accept.mutate(token, {
      onSuccess: (result) => {
        // Redeemed — so it must not follow them around. A token left in the
        // draft would send every later sign-in back to this screen.
        setDraft({ inviteToken: null });
        router.replace(`/groups/${result.group.id}`);
      },
    });
  };

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
            {ready
              ? 'You already have an account — this takes one tap.'
              : signedIn
                ? 'Finish setting up your profile and you’ll land straight in the group.'
                : 'Setting up takes a couple of minutes. Your place in the group is saved until you finish.'}
          </p>
        </Card>

        {accept.error ? <p className="text-base text-danger">{accept.error.message}</p> : null}

        <div className="mt-2 flex flex-col gap-3">
          <Button
            label={
              ready
                ? `Join ${group.name}`
                : signedIn
                  ? 'Finish setting up — then join'
                  : 'Join — set up my account'
            }
            loading={accept.isPending}
            disabled={accept.isPending}
            onClick={enter}
          />
          {/*
            Only for someone with no session. The route they take is the same
            link they are already on: logging in returns them here, signed in,
            one tap from the group.
          */}
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
