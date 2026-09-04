'use client';

import { useState } from 'react';

import { useMe } from '@/api/auth';
import { useLeaderboard, type LeaderboardScope } from '@/api/board';
import { Avatar, Card, RefreshButton, Screen, Spinner } from '@/components';

export default function Board() {
  // All time by default: a week's board is nearly empty on a Monday, and a
  // leaderboard that reads as empty says the product is empty.
  const [scope, setScope] = useState<LeaderboardScope>('alltime');
  const board = useLeaderboard(scope);
  const me = useMe();

  const entries = board.data?.entries ?? [];

  return (
    <Screen>
      <div className="mb-1 mt-2 flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Board</h1>
        <RefreshButton busy={board.isRefetching} onClick={() => void board.refetch()} />
      </div>

      <div role="tablist" aria-label="Leaderboard range" className="flex flex-row gap-2">
        {/* Default first, so the tabs read in the order they are used. */}
        <ScopeTab
          label="All time"
          active={scope === 'alltime'}
          onClick={() => setScope('alltime')}
        />
        <ScopeTab
          label="This week"
          active={scope === 'weekly'}
          onClick={() => setScope('weekly')}
        />
      </div>

      {board.data ? (
        <Card>
          <p className="text-sm font-semibold text-ink-muted">Your position</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {board.data.me.rank !== null ? `#${board.data.me.rank}` : 'Unranked'}
          </p>
          <p className="text-sm text-ink-muted">
            {board.data.me.credits} credits {scope === 'weekly' ? 'this week' : 'all time'}
            {board.data.me.rank === null ? ' · get a task approved to appear here' : ''}
          </p>
        </Card>
      ) : null}

      {entries.length === 0 ? (
        board.isPending ? (
          <div className="flex items-center justify-center py-8 text-ink-subtle">
            <Spinner />
          </div>
        ) : (
          <Card>
            <p className="text-base text-ink">
              Nobody has earned credits {scope === 'weekly' ? 'this week' : 'yet'}.
            </p>
            <p className="mt-1 text-sm text-ink-subtle">Get a task approved to be the first.</p>
          </Card>
        )
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((item) => (
            <li
              key={item.userId}
              className={`flex flex-row items-center gap-3 rounded-lg border p-3 ${
                item.userId === me.data?.id
                  ? 'border-brand bg-brand-muted'
                  : 'border-surface-border bg-surface'
              }`}
            >
              <span className="w-9 text-base font-bold text-ink-muted">#{item.rank}</span>
              <Avatar avatarKey={item.avatarKey} displayName={item.displayName} size={36} />
              <div className="flex flex-1 flex-col">
                <p className="text-base font-semibold text-ink">{item.displayName}</p>
                <p className="text-xs text-ink-subtle">
                  @{item.handle} · {item.currentStreak} day streak
                </p>
              </div>
              <span className="text-base font-bold text-ink">{item.credits}</span>
            </li>
          ))}
        </ol>
      )}
    </Screen>
  );
}

function ScopeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 cursor-pointer rounded-md border py-2.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand text-brand-fg'
          : 'border-surface-border bg-surface text-ink hover:border-brand'
      }`}
    >
      {label}
    </button>
  );
}
