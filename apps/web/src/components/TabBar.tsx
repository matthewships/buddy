'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useWaitingOnYou } from '@/hooks/useWaitingOnYou';

/**
 * The five tabs (§5.2).
 *
 * **Today is gone.** It aggregated tasks across groups, which put the daily loop
 * one level away from the group it belongs to — tasks were already stored
 * against a group, and the screen that showed them was not. Tasks now live in
 * the group, with a member toggle; the cross-group review queue Today also
 * carried became a per-group section, which is where it belongs now that the
 * reviewer is the group's Buddy rather than whoever gets there first.
 *
 * Buddies leads, because finding someone is the first thing a new account can
 * usefully do — it has no group yet, and every other tab would be empty.
 *
 * Glyphs rather than an icon set, matching apps/mobile/app/(tabs)/_layout.tsx.
 * The bar is `sticky` at the bottom of the phone-width column rather than fixed
 * to the viewport, so it sits with the app rather than floating over a wide
 * page.
 *
 * Profile carries the count of everything waiting on a decision from you. It is
 * the right tab for it because that is where the panel listing those items now
 * opens — a badge has to point somewhere, and pointing at the screen that
 * answers it is the whole job. It also means the app spends no permanent space
 * on saying "nothing needs you", which is true most of the time.
 */
const TABS = [
  { href: '/buddies', label: 'Buddies', glyph: '☺' },
  { href: '/groups', label: 'Groups', glyph: '◍' },
  { href: '/feed', label: 'Feed', glyph: '❋' },
  { href: '/board', label: 'Board', glyph: '▲' },
  { href: '/profile', label: 'Profile', glyph: '☰' },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const { count: waiting } = useWaitingOnYou();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-40 flex flex-row border-t border-surface-border bg-surface"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const badge = tab.href === '/profile' ? waiting : 0;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              active ? 'text-brand' : 'text-ink-subtle hover:text-ink-muted'
            }`}
          >
            <span aria-hidden="true" className="relative text-lg leading-none">
              {tab.glyph}
              {badge > 0 ? (
                <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              ) : null}
            </span>
            {tab.label}
            {/*
              The glyph and its badge are `aria-hidden`, so the count is said
              here instead — a screen reader announcing "Profile" with no
              mention of the three things waiting behind it would be the one
              reader that never learns they exist.
            */}
            {badge > 0 ? (
              <span className="sr-only">
                , {badge} waiting on you
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
