import { BADGES, GOALS } from '@buddy/shared';

import { formatEstimate } from './TaskClock';

/**
 * The plan, shown back (§2.9).
 *
 * This is the "based on your answers" moment the coaching apps put after their
 * questionnaire — Noom's plan, Finch's first pet — except that nothing here
 * is a promise about the future. It is the task they just typed, the goal
 * they picked, who will check it, and the first rung of the streak ladder
 * with zero on it. A visitor reading it on `/register` is looking at the
 * exact screen they will get after the code, which is why it is worth typing
 * a password for.
 *
 * Pure: the same card renders on `/register` before an account exists and on
 * `/onboarding/done` after one does, from the draft both times. `checkedBy`
 * is `null` while there is nobody — the card says so rather than hiding the
 * line, because "nobody yet" is the sentence that sends people to the
 * directory.
 */
export function DayOneCard({
  task,
  minutes,
  goalKeys,
  goalText,
  checkedBy,
}: {
  task: string;
  minutes: number;
  goalKeys: readonly string[];
  goalText: string;
  checkedBy: string | null;
}) {
  const hasTask = task.trim().length > 0;
  const goal =
    goalKeys
      .map((key) => (key === 'custom' ? goalText.trim() : GOALS.find((g) => g.key === key)?.label))
      .filter(Boolean)
      .slice(0, 2)
      .join(' · ') || null;
  const firstRung = BADGES.find((b) => b.family === 'streak' && b.tier === 1)!;

  return (
    <div className="bracket flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4 text-ink">
      <div className="flex flex-row items-baseline justify-between">
        <span className="eyebrow">Day one</span>
        <span className="text-xs text-ink-subtle">Today</span>
      </div>

      <div className="flex flex-row items-center gap-3 rounded-lg border border-surface-border bg-surface-muted px-3 py-3">
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
            hasTask ? 'border-brand text-brand' : 'border-dashed border-surface-border text-ink-subtle'
          }`}
        >
          {hasTask ? formatEstimate(minutes) : '·'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-base font-semibold ${hasTask ? 'text-ink' : 'text-ink-subtle'}`}>
            {hasTask ? task.trim() : 'No task yet'}
          </span>
          <span className="text-xs text-ink-subtle">
            {hasTask ? 'Planned · the clock starts when you do' : 'You can add one from your desk'}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-subtle">Toward</dt>
        <dd className="font-medium text-ink">{goal ?? '—'}</dd>
        <dt className="text-ink-subtle">Checked by</dt>
        <dd className={checkedBy ? 'font-medium text-ink' : 'text-ink-muted'}>
          {checkedBy ?? 'Nobody yet — a buddy makes it count'}
        </dd>
        <dt className="text-ink-subtle">Next up</dt>
        <dd className="flex flex-row items-center gap-2 text-ink">
          <span aria-hidden="true">{firstRung.emoji}</span>
          <span className="font-medium">{firstRung.name}</span>
          <span className="text-ink-subtle">
            · 0 of {firstRung.criteria.type === 'streak' ? firstRung.criteria.days : 0}
          </span>
        </dd>
      </dl>
    </div>
  );
}
