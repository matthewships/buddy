'use client';

import { useRouter } from 'next/navigation';

import { useUpdateMe } from '@/api/auth';
import { Button, ErrorText, Screen } from '@/components';
import { draftToPatch, useDraft } from '@/onboarding/draft';

/**
 * The single write that saves everything collected across the onboarding
 * screens, and the point at which the API stamps `onboarded_at`.
 */
export default function OnboardingDone() {
  const router = useRouter();
  const draft = useDraft();
  const updateMe = useUpdateMe();

  const finish = () => {
    updateMe.mutate(draftToPatch(draft), {
      onSuccess: () => {
        draft.reset();
        router.replace('/today');
      },
    });
  };

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <h1 className="text-3xl font-bold text-ink">You&apos;re all set</h1>
        <p className="text-base text-ink-muted">
          @{draft.handle.toLowerCase()} · {draft.goalText.trim() || 'Goal set'}
        </p>
        <p className="text-base text-ink-muted">
          Next: add today&apos;s tasks, then find a buddy to keep you honest.
        </p>

        <ErrorText message={updateMe.error?.message} />

        <div className="mt-6">
          <Button
            label="Finish"
            onClick={finish}
            loading={updateMe.isPending}
            disabled={updateMe.isPending}
          />
        </div>
      </div>
    </Screen>
  );
}
