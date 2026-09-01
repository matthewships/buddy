'use client';

import { useMe } from '@/api/auth';
import { useProfile } from '@/api/users';
import { BackLink, BadgeLadder, Button, Screen, Spinner } from '@/components';

/**
 * The badge list (§2.5) — every badge there is, not only the ones you hold.
 *
 * Reads the public profile endpoint, the same source the profile screen uses,
 * so the stats the bars are drawn from are the stats shown next to them. There
 * is no badge endpoint and no need for one: the definitions are config shipped
 * in `@buddy/shared`, and progress is arithmetic over numbers this response
 * already carries.
 */
export default function Badges() {
  const me = useMe();
  const profile = useProfile(me.data?.handle ?? '');

  if (me.isPending || profile.isPending || !profile.data) {
    return (
      <Screen>
        <BackLink fallback="/profile" label="Profile" />
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen>
        <BackLink fallback="/profile" label="Profile" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-base text-danger">Couldn&apos;t load your badges.</p>
          <Button label="Try again" variant="ghost" onClick={() => void profile.refetch()} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackLink fallback="/profile" label="Profile" />

      <h1 className="mb-1 text-2xl font-bold text-ink">Badges</h1>
      <p className="mb-2 text-sm text-ink-muted">
        Four ladders, one for each thing Buddy counts. Every badge is permanent once earned — a
        broken streak costs you the streak, not the badge.
      </p>

      <BadgeLadder stats={profile.data.stats} badges={profile.data.badges} />

      <div className="h-4" />
    </Screen>
  );
}
