'use client';

import Link from 'next/link';

import { PROFILE_FIELDS, profileStrength, type ProfileStrengthInput } from '@buddy/shared';

import { linkButtonClass } from './buttonStyles';

/**
 * The questions signup stopped asking, asked where the answer matters (§2.9).
 *
 * LinkedIn's profile-strength meter, with the weights taken from the match
 * score rather than invented (`profileStrength` in `@buddy/shared`). It sits
 * on the Buddies tab because that is the screen the missing answers affect —
 * "add where you study" beside a list of strangers is a different sentence
 * from the same words on a settings page — and on the profile because that is
 * where somebody goes to fix it.
 *
 * Shows the heaviest gap as the action and the next two as lines, then stops.
 * Eight bullet points would be a form; three is a nudge. Renders nothing once
 * the profile is complete, so the tab spends no permanent space on being
 * pleased with you.
 *
 * The photo gap links to the profile too: the picker lives on the avatar
 * there, and the edit screen has everything else.
 */
export function GetFoundCard({
  profile,
  compact = false,
}: {
  profile: ProfileStrengthInput;
  /** On the profile itself: no "go to profile" link, just the edit one. */
  compact?: boolean;
}) {
  const strength = profileStrength(profile);
  if (strength.gaps.length === 0) return null;

  const [first, ...rest] = strength.gaps;
  const href = first!.key === 'photo' && !compact ? '/profile' : '/profile/edit';

  return (
    <div className="bracket flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
      <div className="flex flex-row items-baseline justify-between gap-3">
        <span className="eyebrow">Get found</span>
        <span className="font-display text-sm font-bold text-ink">
          {strength.score}%<span className="text-accent"> ↑</span>
        </span>
      </div>

      {/* One block per field, filled or not, in weight order. */}
      <div aria-hidden="true" className="flex flex-row gap-1">
        {PROFILE_FIELDS.map((field) => (
          <span
            key={field.key}
            className={`h-1.5 flex-1 ${
              strength.gaps.some((g) => g.key === field.key) ? 'bg-surface-border' : 'bg-brand'
            }`}
          />
        ))}
      </div>

      <p className="text-sm leading-relaxed text-ink-muted">{first!.why}</p>

      {rest.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-ink-subtle">
          {rest.slice(0, 2).map((gap) => (
            <li key={gap.key}>· {gap.label}</li>
          ))}
        </ul>
      ) : null}

      <Link href={href} className={linkButtonClass('secondary')}>
        {first!.label}
      </Link>
    </div>
  );
}
