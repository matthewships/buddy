'use client';

import { useRouter } from 'next/navigation';

import { MAX_ABOUT, MAX_AVAILABILITY, MAX_HEADLINE } from '@buddy/shared';

import { Button, Field, Screen } from '@/components';
import { useDraft } from '@/onboarding/draft';

export default function OnboardingBuddyProfile() {
  const router = useRouter();
  const headline = useDraft((d) => d.headline);
  const about = useDraft((d) => d.about);
  const availability = useDraft((d) => d.availability);
  const setDraft = useDraft((d) => d.set);

  return (
    <Screen>
      <div className="flex flex-col gap-4 pb-8">
        <h1 className="mt-4 text-3xl font-bold text-ink">Your buddy profile</h1>
        <p className="text-base text-ink-muted">
          This is what someone reads before sending you a request. All optional.
        </p>

        <Field
          label="Headline"
          value={headline}
          onChangeText={(value) => setDraft({ headline: value })}
          maxLength={MAX_HEADLINE}
          placeholder="Thesis by December, up at 6am"
        />
        <Field
          label="About you"
          value={about}
          onChangeText={(value) => setDraft({ about: value })}
          maxLength={MAX_ABOUT}
          multiline
          rows={4}
          placeholder="A few sentences about what you're doing and how you like to be held to it."
        />
        <Field
          label="When you're around"
          value={availability}
          onChangeText={(value) => setDraft({ availability: value })}
          maxLength={MAX_AVAILABILITY}
          placeholder="Evenings, weekdays"
        />

        <Button label="Continue" onClick={() => router.push('/onboarding/done')} />
      </div>
    </Screen>
  );
}
