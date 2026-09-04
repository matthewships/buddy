/**
 * How long ago something was said, in the compact form a feed uses.
 *
 * Deliberately terser than `activityLabel`, which reads as a sentence about a
 * person ("Active 12 min ago"). This sits inline beside a name in a comment
 * thread, where every established feed uses two or three characters and gets
 * out of the way — the timestamp is context, not content.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return '';
  if (elapsed < 60_000) return 'now';

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;

  return `${Math.floor(days / 365)}y`;
}
