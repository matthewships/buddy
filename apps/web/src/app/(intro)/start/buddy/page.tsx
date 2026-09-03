'use client';

import { MAX_AVAILABILITY, MAX_HEADLINE } from '@buddy/shared';

import { useSession } from '@/auth/store';
import { Card, Field, QuestionScreen, Toggle } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * The last question, and the one that decides whether this person appears in
 * the directory at all.
 *
 * Where it goes next depends on who is answering. Someone walking the flow from
 * the landing page has no account yet and goes to registration; someone who
 * already signed in but never finished — a mobile signup, or an abandoned one
 * resumed later — has an account already and goes straight to the write.
 */
export default function BuddyStep() {
  const isOpenBuddy = useDraft((d) => d.isOpenBuddy);
  const headline = useDraft((d) => d.headline);
  const availability = useDraft((d) => d.availability);
  const setDraft = useDraft((d) => d.set);
  const signedIn = useSession((s) => s.status) === 'signedIn';

  return (
    <QuestionScreen
      title="Will you be someone's buddy?"
      subtitle="Buddies review each other's tasks. You can change this whenever you like."
      canContinue
      continueLabel={signedIn ? 'Finish' : 'Lock it in'}
      nextHref={signedIn ? '/onboarding/done' : '/register'}
    >
      <Card>
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-1 flex-col">
            <p className="text-base font-semibold text-ink">Open to buddy requests</p>
            <p className="text-sm text-ink-muted">
              {isOpenBuddy
                ? 'You will appear in the directory for other students to find.'
                : 'You stay hidden. You can still join groups you are invited to.'}
            </p>
          </div>
          <Toggle
            checked={isOpenBuddy}
            onChange={(value) => setDraft({ isOpenBuddy: value })}
            label="Open to buddy requests"
          />
        </div>
      </Card>

      {isOpenBuddy ? (
        <>
          <Field
            label="One line about you (optional)"
            value={headline}
            onChangeText={(value) => setDraft({ headline: value })}
            maxLength={MAX_HEADLINE}
            placeholder="Finishing my thesis, one paragraph at a time"
          />
          <Field
            label="When you're usually around (optional)"
            value={availability}
            onChangeText={(value) => setDraft({ availability: value })}
            maxLength={MAX_AVAILABILITY}
            placeholder="Evenings, weekdays"
          />
        </>
      ) : null}
    </QuestionScreen>
  );
}
