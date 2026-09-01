'use client';

import type { ReactNode } from 'react';

import { COUNTRIES, EDUCATION_LEVELS, GOALS, INTERESTS, MAJORS, TOPICS } from '@buddy/shared';

import type { PublicProfile } from '@/api/users';
import { activityLabel } from '@/lib/activity';

import { Avatar } from './Avatar';
import { Card } from './Card';

function label(list: readonly { key: string; label: string }[], key: string | null) {
  return list.find((entry) => entry.key === key)?.label ?? null;
}

function labels(list: readonly { key: string; label: string }[], keys: readonly string[]) {
  return keys.map((key) => label(list, key) ?? key);
}

/**
 * A titled block inside a card, rather than a card of its own.
 *
 * The profile used to be up to nine stacked cards, several holding a single
 * line — a border and 16px of padding around the word "Canada". Grouping the
 * related ones costs nothing and gives the page back the room those borders
 * were spending.
 */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  return (
    <div className="flex flex-row flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="rounded-full border border-surface-border bg-surface-muted px-3 py-1 text-sm text-ink"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function Stat({ label: text, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-xl font-bold text-ink">{value}</span>
      <span className="text-xs text-ink-subtle">{text}</span>
    </div>
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
 * The photo leads, at a size worth looking at, with the four facts that place
 * someone under it — the same four the directory card shows, because arriving
 * here from that card should feel like the card opening rather than a different
 * page about a different person. Everything the card left out then follows,
 * grouped: what they are working toward, what they like, how they have done.
 *
 * The two callers differ only in what they hang off it: `actions` (a Request
 * button, or Edit and settings) and, for the owner, `banner` for anything that
 * needs saying about their own profile.
 */
export function ProfileView({
  profile,
  banner,
  actions,
}: {
  profile: PublicProfile;
  banner?: ReactNode;
  actions?: ReactNode;
}) {
  const goal = profile.goalText?.trim() || label(GOALS, profile.goalKey);
  const goal2 = label(GOALS, profile.goalKey2);
  const level = label(EDUCATION_LEVELS, profile.educationLevel);
  const major = profile.majorText?.trim() || label(MAJORS, profile.majorKey);
  const from = label(COUNTRIES, profile.country);

  const study = [level, major].filter(Boolean).join(' · ');
  const place = [profile.institution, from].filter(Boolean).join(' · ');

  const topics = labels(TOPICS, profile.topics);
  // `custom` is the one chip whose label is the user's own word.
  const interests = labels(INTERESTS, profile.interests).map((value, index) =>
    profile.interests[index] === 'custom' && profile.interestText?.trim()
      ? profile.interestText.trim()
      : value,
  );

  const activity = activityLabel(profile.lastSeenAt);
  const buddyProfile = profile.buddyProfile;
  const hasGoalBlock = Boolean(goal || profile.bio || buddyProfile?.headline);
  const hasBuddyBlock = Boolean(buddyProfile?.about || buddyProfile?.availability);

  return (
    <>
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <Avatar avatarKey={profile.avatarKey} displayName={profile.displayName} size={104} />
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-ink">{profile.displayName}</h1>
          <p className="text-sm text-ink-subtle">@{profile.handle}</p>
        </div>
        {study ? <p className="text-base font-medium text-ink">{study}</p> : null}
        {place ? <p className="text-sm text-ink-muted">{place}</p> : null}
        {profile.city ? <p className="text-sm text-ink-subtle">{profile.city}</p> : null}

        {/*
          Last seen. It used to sit on the directory card, where it was the
          ninth thing to read; here it is one of the things somebody came to
          find out before deciding whether a request is worth sending.
        */}
        <div className="mt-1 flex flex-row items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              activity === 'Active now' ? 'bg-success' : 'bg-ink-subtle'
            }`}
          />
          <span className="text-xs text-ink-subtle">{activity}</span>
        </div>
      </div>

      {banner}

      {/* The numbers, in a strip rather than a titled card: three figures do not
          need a heading to say what they are, and the labels already do. */}
      <Card>
        <div className="flex flex-row">
          <Stat label="Points" value={profile.stats.totalCredits} />
          <Stat label="Streak" value={`${profile.stats.currentStreak}d`} />
          <Stat label="Best" value={`${profile.stats.bestStreak}d`} />
          <Stat label="Approved" value={profile.stats.tasksApproved} />
        </div>
        <p className="mt-3 border-t border-surface-border pt-2 text-xs text-ink-subtle">
          {profile.stats.reviewsGiven} reviews given · member since{' '}
          {new Date(profile.memberSince).toLocaleDateString()}
        </p>
      </Card>

      {hasGoalBlock ? (
        <Card>
          <div className="flex flex-col gap-4">
            {goal ? (
              <Block title="Working toward">
                <p className="text-base text-ink">{goal}</p>
                {goal2 ? <p className="text-sm text-ink-muted">+ {goal2}</p> : null}
                {buddyProfile?.headline ? (
                  <p className="text-base italic text-ink-muted">{buddyProfile.headline}</p>
                ) : null}
              </Block>
            ) : null}

            {profile.bio ? (
              <Block title="About">
                <p className="text-base text-ink">{profile.bio}</p>
              </Block>
            ) : null}
          </div>
        </Card>
      ) : null}

      {topics.length > 0 || interests.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-4">
            {topics.length > 0 ? (
              <Block title="Favourite topics">
                <Chips values={topics} />
              </Block>
            ) : null}
            {interests.length > 0 ? (
              <Block title="Hobbies and interests">
                <Chips values={interests} />
              </Block>
            ) : null}
          </div>
        </Card>
      ) : null}

      {hasBuddyBlock ? (
        <Card>
          <div className="flex flex-col gap-4">
            {buddyProfile?.about ? (
              <Block title="As a buddy">
                <p className="text-base text-ink">{buddyProfile.about}</p>
              </Block>
            ) : null}
            {buddyProfile?.availability ? (
              <Block title="Usually around">
                <p className="text-base text-ink">{buddyProfile.availability}</p>
              </Block>
            ) : null}
          </div>
        </Card>
      ) : null}

      {profile.badges.length > 0 ? (
        <Card>
          <Block title="Badges">
            <div className="mt-1 flex flex-row flex-wrap gap-2">
              {profile.badges.map((badge) => (
                <span
                  key={badge.key}
                  className="rounded-full border border-surface-border bg-surface-muted px-3 py-1.5 text-xs text-ink"
                >
                  {badge.emoji} {badge.name}
                </span>
              ))}
            </div>
          </Block>
        </Card>
      ) : null}

      {actions}
    </>
  );
}
