'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The five tabs from §5.2, in the mobile app's order.
 *
 * Glyphs and colours match apps/mobile/app/(tabs)/_layout.tsx — text glyphs
 * rather than an icon set, which is what the app ships today. The bar is
 * `sticky` at the bottom of the phone-width column rather than fixed to the
 * viewport, so it sits with the app rather than floating over a wide page.
 */
const TABS = [
  { href: '/today', label: 'Today', glyph: '✓' },
  { href: '/groups', label: 'Groups', glyph: '◍' },
  { href: '/buddies', label: 'Buddies', glyph: '☺' },
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
