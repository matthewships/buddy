import Link from 'next/link';
import { FIRST_STEP } from '@/onboarding/steps';

import { linkButtonClass } from './buttonStyles';
import { Screen } from './Frame';

/**
 * The compact signed-out screen at `/welcome`.
 *
 * `RequireSession` sends a signed-out user here, which is why it exists and why
 * it stayed small when `/` became a landing page: somebody who has just been
 * signed out mid-session wants the way back in, not a pitch for the product
 * they were already using. The two routes said the same thing while `/` had
 * nothing else to say; now they answer different questions.
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
        <span className="eyebrow">For students</span>
        <h1 className="text-4xl font-bold leading-none text-ink">
          Buddy<span className="text-accent">.</span>
        </h1>
        <p className="text-base leading-relaxed text-ink-muted">
          Plan what you will finish today. Have a buddy check it. Keep the streak.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {/*
            Into the questions, not straight to registration. Nobody is asked to
            create an account before they have seen what the product is for —
            the account comes last, once the answers are already theirs.
          */}
          <Link href="/login" className={linkButtonClass('primary')}>
            Sign back in
          </Link>
          <Link href={FIRST_STEP} className={linkButtonClass('ghost')}>
            I&rsquo;m new here
          </Link>
        </div>
      </div>
    </Screen>
  );
}
