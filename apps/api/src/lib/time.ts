/**
 * Time helpers. Everything the database stores is an ISO-8601 UTC string with
 * milliseconds, matching the `strftime` default in the schema, so values
 * written by SQL and by application code sort and compare identically.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoIn(ms: number, from: Date = new Date()): string {
  return new Date(from.getTime() + ms).toISOString();
}

export function isPast(iso: string, at: Date = new Date()): boolean {
  return Date.parse(iso) <= at.getTime();
}

/**
 * The calendar day (YYYY-MM-DD) it currently is for someone in `timezone`.
 * Tasks are planned against a local day, and the rollover cron decides "has
 * midnight passed for this user" by comparing local days, never UTC instants.
 */
export function localDate(timezone: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the stored shape.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * `localDate`, falling back to UTC on a timezone the runtime cannot resolve.
 *
 * The jobs log and skip such a row, because a job can afford to leave it for
 * the next hour. A request cannot: refusing to set someone's status because
 * their stored timezone is unrecognised would be a 500 on a field they never
 * typed. UTC is wrong by at most a day boundary, and the value expires anyway.
 */
export function localDateOrUtc(timezone: string, at: Date = new Date()): string {
  try {
    return localDate(timezone, at);
  } catch {
    return localDate('UTC', at);
  }
}

/** The local wall-clock hour (0-23) in `timezone` — the hourly cron's trigger. */
export function localHour(timezone: string, at: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(at),
  );
}

/** The previous calendar day, for the rollover job. */
export function previousLocalDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * ISO week key, e.g. "2026-W35" — the bucket `user_stats.weekly_credits`
 * belongs to. The leaderboard resets Monday 00:00 UTC (§2.5), which is exactly
 * the ISO week boundary.
 */
export function isoWeekKey(at: Date = new Date()): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // ISO weeks run Monday(1)..Sunday(7); shift to the week's Thursday, which
  // always falls in the correct ISO year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * The instant at which a local calendar day ends, in `timezone`: local
 * midnight at the start of the following day, as UTC. Found by taking the UTC
 * midnight of that next day and correcting by the zone's offset at that
 * instant, twice, so a DST change on the night itself is handled.
 *
 * This is what "the latest start" (PRODUCT.md §3.1) subtracts an estimate
 * from: a task's day ends at *its owner's* midnight, never a server's.
 */
export function localDayEnd(timezone: string, date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d + 1);
  for (let i = 0; i < 2; i += 1) {
    const local = localParts(timezone, new Date(guess));
    const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    // The zone's offset at `guess`, in ms: positive east of Greenwich.
    const offset = asIfUtc - guess;
    guess = Date.UTC(y, m - 1, d + 1) - offset;
  }
  return new Date(guess);
}

/** A local `HH:MM` on a local day, as an instant. Same correction as `localDayEnd`. */
export function localTimeToInstant(timezone: string, date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i += 1) {
    const local = localParts(timezone, new Date(guess));
    const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const offset = asIfUtc - guess;
    guess = Date.UTC(y, m - 1, d, hh, mm) - offset;
  }
  return new Date(guess);
}

function localParts(timezone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour` reads 24 at midnight in some engines under en-GB; normalise.
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') % 24, minute: read('minute') };
}
