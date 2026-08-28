'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { GOALS, OCCUPATIONS } from '@buddy/shared';

import {
  useBuddyDirectory,
  useCurrentRequest,
  useIncomingRequests,
  useRespondToRequest,
  type DirectoryFilters,
} from '@/api/buddies';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  BuddyCard,
  Button,
  Card,
  RefreshButton,
  RequestBanner,
  Screen,
  Spinner,
  Toggle,
  WaitingCard,
} from '@/components';

/**
 * The Buddies tab (§5.2).
 *
 * Three things share this screen because they are the same decision from
 * different sides: incoming requests to answer, an outgoing request to wait on,
 * and the directory to pick from. While a request is pending every "Request"
 * button is disabled — the API allows only one at a time, and the UI should say
 * so rather than let the user discover it through a 409.
 */
export default function Buddies() {
  const router = useRouter();
  const [goal, setGoal] = useState<string | null>(null);
  const [occupation, setOccupation] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo<DirectoryFilters>(
    () => ({
      ...(goal ? { goal } : {}),
      ...(occupation ? { occupation } : {}),
      ...(activeOnly ? { activeOnly: true } : {}),
    }),
    [goal, occupation, activeOnly],
  );

  const directory = useBuddyDirectory(filters);
  const current = useCurrentRequest();
  const incoming = useIncomingRequests();
  const respond = useRespondToRequest();

  const pending = current.data?.request ?? null;
  const outcome = current.data?.outcome ?? null;
  const buddies = directory.data?.pages.flatMap((page) => page.buddies) ?? [];

  const busy = respond.accept.isPending || respond.decline.isPending || respond.cancel.isPending;

  // Replaces FlatList's onEndReached; see hooks/useInfiniteScroll.ts.
  const sentinelRef = useInfiniteScroll(() => void directory.fetchNextPage(), {
    enabled: directory.hasNextPage && !directory.isFetchingNextPage,
  });

  const acceptedGroup = outcome?.status === 'accepted' ? outcome.group : null;

  return (
    <Screen>
      <div className="mb-1 mt-2 flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Buddies</h1>
        <RefreshButton busy={directory.isRefetching} onClick={() => void directory.refetch()} />
      </div>

      {incoming.data?.requests.map((request) => (
        <RequestBanner
          key={request.id}
          request={request}
          busy={busy}
          onAccept={() =>
            respond.accept.mutate(request.id, {
              onSuccess: (result) => router.push(`/groups/${result.group.id}`),
            })
          }
          onDecline={() => respond.decline.mutate(request.id)}
        />
      ))}

      {pending ? (
        <WaitingCard
          request={pending}
          busy={busy}
          onCancel={() => respond.cancel.mutate(pending.id)}
        />
      ) : null}

      {/* A resolved request the user hasn't acted on yet. */}
      {!pending && acceptedGroup ? (
        <Card className="border-success">
          <p className="text-base font-bold text-ink">
            {outcome?.user?.displayName ?? 'Your buddy'} accepted
          </p>
          <div className="mt-3">
            <Button
              label={`Open ${acceptedGroup.name}`}
              onClick={() => router.push(`/groups/${acceptedGroup.id}`)}
            />
          </div>
        </Card>
      ) : null}

      {!pending && outcome && outcome.status !== 'accepted' ? (
        <Card>
          <p className="text-base text-ink">
            No answer from {outcome.user?.displayName ?? 'them'} — try another buddy.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-row items-center justify-between">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="cursor-pointer text-base font-semibold text-brand"
        >
          {filtersOpen ? 'Hide filters' : 'Filters'}
        </button>
        <div className="flex flex-row items-center gap-2">
          <span className="text-sm text-ink-muted">Active in last 15 min</span>
          <Toggle
            checked={activeOnly}
            onChange={setActiveOnly}
            label="Only show buddies active in the last 15 minutes"
          />
        </div>
      </div>

      {filtersOpen ? (
        <Card>
          <FilterRow
            title="Goal"
            options={GOALS}
            selected={goal}
            onSelect={(key) => setGoal(key === goal ? null : key)}
          />
          <div className="h-3" />
          <FilterRow
            title="Occupation"
            options={OCCUPATIONS}
            selected={occupation}
            onSelect={(key) => setOccupation(key === occupation ? null : key)}
          />
        </Card>
      ) : null}

      {buddies.length === 0 ? (
        directory.isPending ? (
          <div className="flex items-center justify-center py-8 text-ink-subtle">
            <Spinner />
          </div>
        ) : (
          <Card>
            <p className="text-base text-ink">No buddies match those filters yet.</p>
            <p className="mt-1 text-sm text-ink-subtle">
              Try clearing them, or check back when more people are around.
            </p>
          </Card>
        )
      ) : (
        <>
          {buddies.map((buddy) => (
            <BuddyCard
              key={buddy.id}
              buddy={buddy}
              onPress={() => router.push(`/buddies/${buddy.handle}`)}
            />
          ))}
          <div ref={sentinelRef} aria-hidden="true" />
          {directory.isFetchingNextPage ? (
            <div className="flex items-center justify-center py-4 text-ink-subtle">
              <Spinner />
            </div>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function FilterRow({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: readonly { key: string; label: string }[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink-muted">{title}</p>
      <div className="flex flex-row flex-wrap gap-2">
        {options
          .filter((option) => option.key !== 'custom')
          .map((option) => {
            const active = option.key === selected;
            return (
              <button
                key={option.key}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => onSelect(option.key)}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? 'border-brand bg-brand font-semibold text-brand-fg'
                    : 'border-surface-border bg-surface text-ink hover:border-brand'
                }`}
              >
                {option.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}
