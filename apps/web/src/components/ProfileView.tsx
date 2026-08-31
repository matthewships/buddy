'use client';

import {
  COUNTRIES,
  EDUCATION_LEVELS,
  GOALS,
  INTERESTS,
  MAJORS,
  TOPICS,
} from '@buddy/shared';

import type { PublicProfile } from '@/api/users';

import { Avatar } from './Avatar';
import { Card } from './Card';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

function labels(list: readonly { key: string; label: string }[], keys: readonly string[]) {
  return keys.map((key) => label(list, key) ?? key);
}

function ChipList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <Card>
      <p className="mb-2 text-sm font-semibold text-ink-muted">{title}</p>
      <div className="flex flex-row flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-surface-border bg-surface-muted px-3 py-1.5 text-sm text-ink"
          >
            {value}
          </span>
        ))}
      </div>
    </Card>
  );
}

/**
 * One profile, rendered the same way wherever it appears.
 *
 * The screen a user sees of themselves and the screen they read before sending
 * a request are the same screen — that is the point. It is also the only way to
 * keep the promise the directory makes: if your own profile shows you something
 * a stranger's view of it does not, you cannot tell what you are presenting.
 *
 * The two callers differ only in what they hang off the bottom: `actions` (a
 * Request button, or Edit and settings) and, for the owner, `banner` for
 * anything that needs saying about their own profile.
 */
export function ProfileView({
  profile,
  banner,
  actions,
}: {
  profile: PublicProfile;
  banner?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const goal = profile.goalText?.trim() || label(GOALS, profile.goalKey);
  const goal2 = label(GOALS, profile.goalKey2);
  const level = label(EDUCATION_LEVELS, profile.educationLevel);
  const major = profile.majorText?.trim() || label(MAJORS, profile.majorKey);
  const from = label(COUNTRIES, profile.country);

  const study = [level, major].filter(Boolean).join(' · ');
  const place = [profile.institution, profile.city].filter(Boolean).join(' · ');

  return (
    <>
      <div className="flex flex-row items-center gap-4">
        <Avatar avatarKey={profile.avatarKey} displayName={profile.displayName} size={72} />
        <div className="flex flex-1 flex-col">
          <h1 className="text-2xl font-bold text-ink">{profile.displayName}</h1>
          <p className="text-base text-ink-subtle">@{profile.handle}</p>
          {study ? <p className="mt-1 text-base text-ink">{study}</p> : null}
        </div>
      </div>

      {banner}

      {place || from ? (
        <Card>
          {place ? <p className="text-base text-ink">{place}</p> : null}
          {from ? <p className="text-sm text-ink-muted">From {from}</p> : null}
        </Card>
      ) : null}

      {profile.bio ? (
        <Card>
          <p className="mb-1 text-sm font-semibold text-ink-muted">About</p>
          <p className="text-base text-ink">{profile.bio}</p>
        </Card>
      ) : null}

      {goal ? (
        <Card>
          <p className="mb-1 text-sm font-semibold text-ink-muted">Working toward</p>
          <p className="text-base text-ink">{goal}</p>
          {goal2 ? <p className="text-sm text-ink-muted">+ {goal2}</p> : null}
          {profile.buddyProfile?.headline ? (
            <p className="mt-2 text-base italic text-ink-muted">
              {profile.buddyProfile.headline}
            </p>
          ) : null}
        </Card>
      ) : null}

      <ChipList title="Favourite topics" values={labels(TOPICS, profile.topics)} />
      <ChipList title="Hobbies and interests" values={labels(INTERESTS, profile.interests)} />

      {profile.buddyProfile?.about ? (
        <Card>
          <p className="mb-1 text-sm font-semibold text-ink-muted">As a buddy</p>
          <p className="text-base text-ink">{profile.buddyProfile.about}</p>
        </Card>
      ) : null}

      {profile.buddyProfile?.availability ? (
        <Card>
          <p className="mb-1 text-sm font-semibold text-ink-muted">Usually around</p>
          <p className="text-base text-ink">{profile.buddyProfile.availability}</p>
        </Card>
      ) : null}

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Track record</p>
        <div className="flex flex-row justify-between">
          <Stat label="Points" value={profile.stats.totalCredits} />
          <Stat label="Streak" value={`${profile.stats.currentStreak}d`} />
          <Stat label="Best" value={`${profile.stats.bestStreak}d`} />
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {profile.stats.tasksApproved} tasks approved · {profile.stats.reviewsGiven} reviews given
        </p>
        <p className="mt-1 text-xs text-ink-subtle">
          Member since {new Date(profile.memberSince).toLocaleDateString()}
        </p>
      </Card>

      {profile.badges.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink-muted">Badges</p>
          <div className="flex flex-row flex-wrap gap-2">
            {profile.badges.map((badge) => (
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

      {actions}
    </>
  );
}

function Stat({ label: text, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-ink-muted">{text}</p>
    </div>
  );
}
