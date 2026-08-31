'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  COUNTRIES,
  EDUCATION_LEVELS,
  GOALS,
  INTERESTS,
  MAJORS,
  MAX_AVAILABILITY,
  MAX_BIO,
  MAX_CITY,
  MAX_GOALS,
  MAX_GOAL_TEXT,
  MAX_HEADLINE,
  MAX_INSTITUTION,
  MAX_INTERESTS,
  MAX_MAJOR_TEXT,
  MAX_TOPICS,
  TOPICS,
} from '@buddy/shared';

import { useMe, useUpdateMe } from '@/api/auth';
import {
  BackLink,
  Button,
  Card,
  Chips,
  ErrorText,
  Field,
  Screen,
  Spinner,
} from '@/components';

/**
 * Editing every answer signup asks, plus the ones it doesn't.
 *
 * There was previously no way to change a goal or an occupation after
 * onboarding at all — the answers were write-once. That was survivable with two
 * fields and is not with ten, and it strands every account that predates the
 * student profile: those users have none of these set and no way to set them.
 *
 * One form, one save. The fields mirror the question screens rather than
 * re-deriving their rules, and the API is the same `PATCH /me` the questionnaire
 * ends with — so anything valid there is valid here.
 */
export default function EditProfile() {
  const router = useRouter();
  const me = useMe();
  const updateMe = useUpdateMe();

  const [form, setForm] = useState<{
    educationLevel: string | null;
    institution: string;
    city: string;
    majorKey: string | null;
    majorText: string;
    country: string | null;
    goalKeys: string[];
    goalText: string;
    topics: string[];
    interests: string[];
    bio: string;
    headline: string;
    availability: string;
  } | null>(null);

  // Seeded once, when /me arrives. Afterwards the form owns its state — copying
  // on every render would overwrite what the user is typing.
  const loaded = me.data;
  useEffect(() => {
    if (!loaded || form) return;
    setForm({
      educationLevel: loaded.educationLevel,
      institution: loaded.institution ?? '',
      city: loaded.city ?? '',
      majorKey: loaded.majorKey,
      majorText: loaded.majorText ?? '',
      country: loaded.country,
      goalKeys: [loaded.goalKey, loaded.goalKey2].filter((key): key is string => Boolean(key)),
      goalText: loaded.goalText ?? '',
      topics: loaded.topics,
      interests: loaded.interests,
      bio: loaded.bio ?? '',
      headline: loaded.buddyProfile?.headline ?? '',
      availability: loaded.buddyProfile?.availability ?? '',
    });
  }, [loaded, form]);

  if (!form) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  const patch = (values: Partial<NonNullable<typeof form>>) =>
    setForm((current) => (current ? { ...current, ...values } : current));

  const optional = (value: string) => (value.trim().length > 0 ? value.trim() : null);

  const needsMajorText = form.majorKey === 'custom';
  const needsGoalText = form.goalKeys.includes('custom');
  const canSave =
    (!needsMajorText || form.majorText.trim().length > 0) &&
    (!needsGoalText || form.goalText.trim().length > 0) &&
    form.goalKeys.length > 0;

  const save = () => {
    updateMe.mutate(
      {
        educationLevel: form.educationLevel,
        institution: optional(form.institution),
        city: optional(form.city),
        majorKey: form.majorKey,
        majorText: optional(form.majorText),
        country: form.country,
        goalKey: form.goalKeys[0],
        goalKey2: form.goalKeys[1] ?? null,
        goalText: optional(form.goalText),
        topics: form.topics,
        interests: form.interests,
        bio: optional(form.bio),
        buddyProfile: {
          headline: optional(form.headline) ?? undefined,
          availability: optional(form.availability) ?? undefined,
        },
      },
      { onSuccess: () => router.replace('/profile') },
    );
  };

  return (
    <Screen>
      <BackLink fallback="/profile" label="Profile" />
      <h1 className="mb-1 text-2xl font-bold text-ink">Edit profile</h1>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Study</p>
        <div className="flex flex-col gap-4">
          <Chips
            label="Level of study"
            options={EDUCATION_LEVELS}
            selected={form.educationLevel}
            onSelect={(key) =>
              patch({ educationLevel: key === form.educationLevel ? null : key })
            }
          />
          <Field
            label="School or university"
            value={form.institution}
            onChangeText={(value) => patch({ institution: value })}
            maxLength={MAX_INSTITUTION}
            autoCapitalize="words"
          />
          <Field
            label="City"
            value={form.city}
            onChangeText={(value) => patch({ city: value })}
            maxLength={MAX_CITY}
            autoCapitalize="words"
          />
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Subject</p>
        <div className="flex flex-col gap-4">
          <Chips
            label="Field of study"
            options={MAJORS}
            selected={form.majorKey}
            onSelect={(key) => patch({ majorKey: key === form.majorKey ? null : key })}
          />
          <Field
            label={needsMajorText ? 'Your subject' : 'Add a detail (optional)'}
            value={form.majorText}
            onChangeText={(value) => patch({ majorText: value })}
            maxLength={MAX_MAJOR_TEXT}
            error={needsMajorText && !form.majorText.trim() ? 'Tell us what you study' : null}
          />
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Goals</p>
        <div className="flex flex-col gap-4">
          <Chips
            label={`Goal (max ${MAX_GOALS})`}
            options={GOALS}
            selected={form.goalKeys}
            max={MAX_GOALS}
            onChange={(keys) => patch({ goalKeys: keys })}
          />
          <Field
            label={needsGoalText ? 'Your goal' : 'Add a detail (optional)'}
            value={form.goalText}
            onChangeText={(value) => patch({ goalText: value })}
            maxLength={MAX_GOAL_TEXT}
            error={
              form.goalKeys.length === 0
                ? 'Pick at least one goal'
                : needsGoalText && !form.goalText.trim()
                  ? 'Describe your goal'
                  : null
            }
          />
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Where you&apos;re from</p>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Country</span>
          <select
            value={form.country ?? ''}
            onChange={(event) => patch({ country: event.target.value || null })}
            className="cursor-pointer rounded-xl border border-surface-border bg-surface px-3 py-2 text-base text-ink"
          >
            <option value="">Prefer not to say</option>
            {COUNTRIES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">
          Favourite topics (max {MAX_TOPICS})
        </p>
        <Chips
          label={`Favourite topics (max ${MAX_TOPICS})`}
          options={TOPICS}
          selected={form.topics}
          max={MAX_TOPICS}
          onChange={(keys) => patch({ topics: keys })}
        />
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">
          Hobbies and interests (max {MAX_INTERESTS})
        </p>
        <Chips
          label={`Hobbies and interests (max ${MAX_INTERESTS})`}
          options={INTERESTS}
          selected={form.interests}
          max={MAX_INTERESTS}
          onChange={(keys) => patch({ interests: keys })}
        />
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">In your own words</p>
        <div className="flex flex-col gap-4">
          <Field
            label="About you"
            value={form.bio}
            onChangeText={(value) => patch({ bio: value })}
            maxLength={MAX_BIO}
            hint={`${form.bio.length}/${MAX_BIO}`}
            multiline
            rows={4}
          />
          <Field
            label="One line about you as a buddy"
            value={form.headline}
            onChangeText={(value) => patch({ headline: value })}
            maxLength={MAX_HEADLINE}
          />
          <Field
            label="When you're usually around"
            value={form.availability}
            onChangeText={(value) => patch({ availability: value })}
            maxLength={MAX_AVAILABILITY}
          />
        </div>
      </Card>

      <ErrorText message={updateMe.error?.message} />

      <div className="mb-6 mt-2 flex flex-col gap-3">
        <Button
          label="Save"
          onClick={save}
          disabled={!canSave || updateMe.isPending}
          loading={updateMe.isPending}
        />
        <Button label="Cancel" variant="ghost" onClick={() => router.replace('/profile')} />
      </div>
    </Screen>
  );
}
