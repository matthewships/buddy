'use client';

import {
  BADGE_FAMILIES,
  type BadgeProgress,
  type BadgeStats,
  badgeProgress,
  nextBadge,
} from '@buddy/shared';

/** What a profile carries about the badges someone actually holds. */
export interface HeldBadge {
  key: string;
  awardedAt: string;
}

function held(badges: readonly HeldBadge[]) {
  return badges.map((b) => b.key);
}

/**
 * A locked badge's distance to its target.
 *
 * The number is under the bar rather than inside it: at 3 of 200 there is no
 * room inside, and a bar that sometimes carries its label and sometimes does
 * not reads as two different components.
 */
function Progress({ current, target, fraction }: BadgeProgress) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={target}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          // A hairline of colour at 0 would claim progress nobody has made.
          style={{ width: fraction === 0 ? 0 : `${Math.max(4, fraction * 100)}%` }}
        />
      </div>
      <span className="text-xs text-ink-subtle">
        {current.toLocaleString()} of {target.toLocaleString()}
      </span>
    </div>
  );
}

function Row({ progress, awardedAt }: { progress: BadgeProgress; awardedAt?: string }) {
  const { badge, earned } = progress;

  return (
    <li className="flex flex-row items-start gap-3 py-3">
      {/*
        The locked tile keeps its own emoji rather than showing a padlock. Which
        badge is coming is the useful half of the information, and a column of
        identical padlocks says nothing at all.
      */}
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
          earned ? 'bg-brand-muted' : 'bg-surface-muted grayscale opacity-45'
        }`}
      >
        {badge.emoji}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-row items-baseline justify-between gap-2">
          <span className={`text-base font-semibold ${earned ? 'text-ink' : 'text-ink-muted'}`}>
            {badge.name}
          </span>
          {earned ? (
            <span className="shrink-0 text-xs font-semibold text-success">
              {awardedAt ? `Earned ${new Date(awardedAt).toLocaleDateString()}` : 'Earned'}
            </span>
          ) : null}
        </div>
        <span className="text-sm text-ink-muted">{badge.description}</span>
        {earned ? null : <Progress {...progress} />}
      </div>
    </li>
  );
}

/**
 * Every badge there is, grouped by the thing it measures, locked ones included
 * and showing how far off they are (§2.5).
 *
 * Showing only what someone has earned is what a trophy cabinet does, and it is
 * exactly wrong for a new account: an empty cabinet is the screen with the
 * least to say to the person who most needs telling what this app rewards. The
 * ladders are always all here; what changes is how much of each one is lit.
 */
export function BadgeLadder({ stats, badges }: { stats: BadgeStats; badges: readonly HeldBadge[] }) {
  const progress = badgeProgress(stats, held(badges));
  const awarded = new Map(badges.map((b) => [b.key, b.awardedAt]));
  const earnedCount = progress.filter((p) => p.earned).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-baseline justify-between">
        <p className="text-base font-semibold text-ink">
          {earnedCount} of {progress.length} earned
        </p>
      </div>

      {BADGE_FAMILIES.map((family) => {
        const rows = progress.filter((p) => p.badge.family === family.key);
        const done = rows.filter((p) => p.earned).length;

        return (
          <section
            key={family.key}
            className="flex flex-col rounded-lg border border-surface-border bg-surface p-4"
          >
            <div className="flex flex-row items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {family.label}
              </h2>
              <span className="text-xs text-ink-subtle">
                {done}/{rows.length}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">{family.blurb}</p>

            <ul className="mt-1 flex flex-col divide-y divide-surface-border">
              {rows.map((p) => (
                <Row key={p.badge.key} progress={p} awardedAt={awarded.get(p.badge.key)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The single closest locked badge, as one line.
 *
 * This is the piece that answers "my points should turn into something": it
 * sits next to the point total and names what the next hundred of them buys.
 * Renders nothing once every badge is held, rather than an empty encouragement.
 */
export function NextBadgeLine({
  stats,
  badges,
  className = '',
}: {
  stats: BadgeStats;
  badges: readonly HeldBadge[];
  /**
   * Applied to the root. Callers hang a divider off this rather than wrapping
   * the line, because there is nothing to divide once every badge is held and
   * this renders nothing.
   */
  className?: string;
}) {
  const next = nextBadge(stats, held(badges));
  if (!next) return null;

  return (
    <div className={`flex flex-row items-center gap-3 ${className}`}>
      <span aria-hidden="true" className="text-lg grayscale opacity-45">
        {next.badge.emoji}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-ink">
          Next up: <span className="font-semibold">{next.badge.name}</span>
        </span>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: next.fraction === 0 ? 0 : `${Math.max(4, next.fraction * 100)}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-xs text-ink-subtle">
        {next.current.toLocaleString()}/{next.target.toLocaleString()}
      </span>
    </div>
  );
}
