import Link from 'next/link';

import { linkButtonClass } from './buttonStyles';
import { Screen } from './Frame';

/**
 * The landing content, shared by `/` and `/welcome`.
 *
 * Two routes render the same screen: `/` is the public landing page, and
 * `/welcome` has to keep existing because `RequireSession` sends a signed-out
 * user there. One component rather than two copies, so the copy and the
 * spacing cannot drift.
 *
 * Deliberately *not* a client component. This is the first paint of the site
 * for anyone arriving without a session, and a `'use client'` here would put
 * the real markup behind ~630 KiB of JS: the prerendered HTML would be blank
 * until hydration finished, roughly 1.5s on a throttled phone against a ~200ms
 * first contentful paint. As a server component the markup ships in the HTML
 * and the two buttons — plain links — work before any script has run.
 *
 * That is also why the navigations are `next/link` rather than `Button` +
 * `router.push`: `Button` renders a `<button>` and takes an `onClick`, neither
 * of which a server component can use, and a click handler cannot fire before
 * hydration anyway. The look is shared through buttonStyles.ts rather than
 * copied, so the two cannot drift.
 */

export function WelcomeScreen() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <h1 className="text-4xl font-bold text-ink">Buddy</h1>
        <p className="text-base text-ink-muted">
          For students. Plan your day, get it approved by a buddy, build the streak.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {/*
            Into the questions, not straight to registration. Nobody is asked to
            create an account before they have seen what the product is for —
            the account comes last, once the answers are already theirs.
          */}
          <Link href="/start/level" className={linkButtonClass('primary')}>
            Get started
          </Link>
          <Link href="/login" className={linkButtonClass('ghost')}>
            I already have an account
          </Link>
        </div>
      </div>
    </Screen>
  );
}
