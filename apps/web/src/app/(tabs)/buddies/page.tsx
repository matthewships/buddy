'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { COUNTRIES, EDUCATION_LEVELS, GOALS, MAJORS, TOPICS } from '@buddy/shared';

import { useMe } from '@/api/auth';
import {
  useBuddyDirectory,
  useCurrentRequest,
  useIncomingRequests,
  useRespondToRequest,
  useSendRequest,
  type BuddySort,
  type DirectoryFilters,
} from '@/api/buddies';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  BuddyCard,
  Button,
  Card,
  ErrorText,
  RefreshButton,
  RequestBanner,
  Screen,
  Segmented,
  Spinner,
  Toggle,
  WaitingCard,
} from '@/components';

const SORTS = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'points', label: 'Points' },
] as const satisfies readonly { key: BuddySort; label: string }[];

/**
 * The Buddies tab — Unibuddy's Connect screen, with Request where its Message
 * button sits.
 *
 * Four things share this screen because they are the same decision from
 * different sides: incoming requests to answer, an outgoing request to wait on,
 * how the list is ordered, and the list itself. While a request is pending every
 * "Request" button goes disabled and says why — the API allows one at a time,
 * and the UI should state that rather than let the user find out through a 409.
 */
export default function Buddies() {
  const router = useRouter();
  const me = useMe();

  const [sort, setSort] = useState<BuddySort>('recommended');
  const [goal, setGoal] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [major, setMajor] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [sameInstitution, setSameInstitution] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo<DirectoryFilters>(
    () => ({
      ...(goal ? { goal } : {}),
      ...(level ? { level } : {}),
      ...(major ? { major } : {}),
      ...(topic ? { topic } : {}),
      ...(country ? { country } : {}),
      ...(sameInstitution ? { sameInstitution: true } : {}),
      ...(activeOnly ? { activeOnly: true } : {}),
    }),
    [goal, level, major, topic, country, sameInstitution, activeOnly],
  );

  const activeFilterCount = Object.keys(filters).length;

  const directory = useBuddyDirectory(filters, sort);
  const current = useCurrentRequest();
  const incoming = useIncomingRequests();
  const respond = useRespondToRequest();
  const sendRequest = useSendRequest();

  const pending = current.data?.request ?? null;
  const outcome = current.data?.outcome ?? null;
  const buddies = directory.data?.pages.flatMap((page) => page.buddies) ?? [];

  const busy = respond.accept.isPending || respond.decline.isPending || respond.cancel.isPending;

  // Replaces FlatList's onEndReached; see hooks/useInfiniteScroll.ts.
  const sentinelRef = useInfiniteScroll(() => void directory.fetchNextPage(), {
    enabled: directory.hasNextPage && !directory.isFetchingNextPage,
  });

  const acceptedGroup = outcome?.status === 'accepted' ? outcome.group : null;
  const myInstitution = me.data?.institution?.trim();

  const clearFilters = () => {
    setGoal(null);
    setLevel(null);
    setMajor(null);
    setTopic(null);
    setCountry(null);
    setSameInstitution(false);
    setActiveOnly(false);
  };

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

      <Segmented label="Sort buddies by" options={SORTS} value={sort} onChange={setSort} />

      <div className="flex flex-row items-center justify-between">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="cursor-pointer text-base font-semibold text-brand"
        >
          {filtersOpen ? 'Hide filters' : 'Filters'}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={clearFilters}
            className="cursor-pointer text-sm text-ink-muted hover:text-ink"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {filtersOpen ? (
        <Card>
          <div className="flex flex-col gap-4">
            <FilterRow
              title="Level of study"
              options={EDUCATION_LEVELS}
              selected={level}
              onSelect={(key) => setLevel(key === level ? null : key)}
            />
            <FilterRow
              title="Subject"
              options={MAJORS}
              selected={major}
              onSelect={(key) => setMajor(key === major ? null : key)}
            />
            <FilterRow
              title="Topic"
              options={TOPICS}
              selected={topic}
              onSelect={(key) => setTopic(key === topic ? null : key)}
            />
            <FilterRow
              title="Goal"
              options={GOALS}
              selected={goal}
              onSelect={(key) => setGoal(key === goal ? null : key)}
            />

            {/*
              A <select> rather than chips: ~200 countries is far past the point
              where a wrapped chip list is scannable, and this is a filter, not
              a question — compactness beats browsability here.
            */}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-muted">From</span>
              <select
                value={country ?? ''}
                onChange={(event) => setCountry(event.target.value || null)}
                className="cursor-pointer rounded-xl border border-surface-border bg-surface px-3 py-2 text-base text-ink"
              >
                <option value="">Anywhere</option>
                {COUNTRIES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {/*
              Institutions are free text, so "the same as mine" is the only
              institution question a filter can ask. Hidden entirely when the
              user has not said where they study — it would match nobody, and a
              control that can only return an empty list is a trap.
            */}
            {myInstitution ? (
              <div className="flex flex-row items-center justify-between gap-4">
                <span className="text-sm text-ink-muted">Only {myInstitution}</span>
                <Toggle
                  checked={sameInstitution}
                  onChange={setSameInstitution}
                  label={`Only show buddies at ${myInstitution}`}
                />
              </div>
            ) : null}

            <div className="flex flex-row items-center justify-between gap-4">
              <span className="text-sm text-ink-muted">Active in last 15 min</span>
              <Toggle
                checked={activeOnly}
                onChange={setActiveOnly}
                label="Only show buddies active in the last 15 minutes"
              />
            </div>
          </div>
        </Card>
      ) : null}

      <ErrorText message={sendRequest.error?.message} />

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
              onRequest={(message) =>
                sendRequest.mutate({
                  toUserId: buddy.id,
                  ...(message ? { message } : {}),
                })
              }
              requestDisabled={Boolean(pending)}
              requestDisabledReason="You already have a request waiting"
              busy={sendRequest.isPending}
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
