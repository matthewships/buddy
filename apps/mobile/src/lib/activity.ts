/**
 * Client-side mirror of the server's activity label (services/matching.ts).
 *
 * The directory gets its label from the API so every viewer agrees, but group
 * member rows carry a raw `last_seen_at`, and formatting it here avoids adding a
 * field to that payload purely for display.
 */
export function activityLabel(lastSeenAt: string | null, now: Date = new Date()): string {
  if (!lastSeenAt) return 'New here';

  const elapsed = now.getTime() - Date.parse(lastSeenAt);
  if (elapsed < 2 * 60 * 1000) return 'Active now';
  if (elapsed < 60 * 60 * 1000) return `Active ${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 24 * 60 * 60 * 1000) return `Active ${Math.floor(elapsed / 3_600_000)}h ago`;
  const days = Math.floor(elapsed / 86_400_000);
  return days === 1 ? 'Active yesterday' : `Active ${days}d ago`;
}
