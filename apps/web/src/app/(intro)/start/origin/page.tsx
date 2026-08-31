'use client';

import { useMemo, useState } from 'react';

import { COUNTRIES } from '@buddy/shared';

import { Field, QuestionScreen } from '@/components';
import { useDraft } from '@/onboarding/draft';

/**
 * ~200 options is too many for chips and too many for a native `<select>` to be
 * pleasant on a phone, so this is a filter box over a scrolling list. The
 * chosen country is pinned to the top once picked, so it stays visible after
 * the filter is cleared.
 */
export default function OriginStep() {
  const country = useDraft((d) => d.country);
  const setDraft = useDraft((d) => d.set);
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? COUNTRIES.filter((c) => c.label.toLowerCase().includes(needle))
      : COUNTRIES;
    const chosen = COUNTRIES.find((c) => c.key === country);
    if (!chosen || list.some((c) => c.key === chosen.key)) return list;
    return [chosen, ...list];
  }, [search, country]);

  return (
    <QuestionScreen
      title="Where are you from?"
      subtitle="Students far from home tend to look for each other. This is how they find you."
      canContinue={country !== null}
      skipLabel="Skip for now"
    >
      <Field
        label="Search countries"
        value={search}
        onChangeText={setSearch}
        placeholder="Start typing…"
      />
      <div
        role="radiogroup"
        aria-label="Country"
        className="flex max-h-72 flex-col overflow-y-auto rounded-2xl border border-surface-border bg-surface"
      >
        {matches.length === 0 ? (
          <p className="p-4 text-sm text-ink-subtle">No country matches “{search.trim()}”.</p>
        ) : (
          matches.map((option) => {
            const active = option.key === country;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDraft({ country: option.key })}
                className={`cursor-pointer border-b border-surface-border px-4 py-3 text-left text-base last:border-b-0 ${
                  active ? 'bg-brand font-semibold text-brand-fg' : 'text-ink hover:bg-surface-muted'
                }`}
              >
                {option.label}
              </button>
            );
          })
        )}
      </div>
    </QuestionScreen>
  );
}
