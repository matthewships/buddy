'use client';

import { useRouter } from 'next/navigation';

import { Button, Card, Screen, Toggle } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * "Are you willing to be someone's buddy?" (§2.1 step 5). Goal and occupation
 * are collected from everyone because they drive matching in both directions;
 * only open buddies fill in a buddy profile.
 */
export default function OnboardingBuddyToggle() {
  const router = useRouter();
  const isOpenBuddy = useDraft((d) => d.isOpenBuddy);
  const setDraft = useDraft((d) => d.set);

  return (
    <Screen>
      <div className="flex flex-col gap-4">
        <h1 className="mt-4 text-3xl font-bold text-ink">Want to be a buddy?</h1>
        <p className="text-base text-ink-muted">
          Open buddies appear in the directory so people looking for accountability can send you a
          request. You can change this any time.
        </p>

        <Card>
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="flex flex-1 flex-col">
              <p className="text-base font-semibold text-ink">Show me in the directory</p>
              <p className="text-sm text-ink-muted">
                {isOpenBuddy
                  ? 'People can send you buddy requests.'
                  : 'You can still create groups and invite people you know.'}
              </p>
            </div>
            <Toggle
              checked={isOpenBuddy}
              onChange={(value) => setDraft({ isOpenBuddy: value })}
              label="Show me in the buddy directory"
            />
          </div>
        </Card>

        <Button
          label="Continue"
          onClick={() =>
            router.push(isOpenBuddy ? '/onboarding/buddy-profile' : '/onboarding/done')
          }
        />
      </div>
    </Screen>
  );
}
