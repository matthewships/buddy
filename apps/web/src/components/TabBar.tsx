'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-40 flex flex-row border-t border-surface-border bg-surface"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              active ? 'text-brand' : 'text-ink-subtle hover:text-ink-muted'
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {tab.glyph}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
