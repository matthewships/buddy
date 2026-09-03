import Link from 'next/link';

import { FIRST_STEP } from '@/onboarding/steps';
import type { ReactNode } from 'react';

import {
  ABANDON_PENALTY,
  BADGES,
  BADGE_FAMILIES,
  BUDDY_REQUEST_TTL_MS,
  CREDITS_PER_RATING_POINT,
  DAILY_COMPLETION_BONUS,
  EDUCATION_LEVELS,
  GOALS,
  INVITE_LINK_MAX_USES,
  MAX_RATING,
  MAX_TASK_MINUTES,
  MIN_AGE_YEARS,
  MIN_TASK_MINUTES,
  REACTIONS,
  STATUSES,
} from '@buddy/shared';

import { BUTTON_BASE, BUTTON_VARIANT, type ButtonVariant } from './buttonStyles';

/**
 * The public landing page at `/`.
 *
 * **Why it is not in the phone column.** Frame.tsx says every layout wraps its
 * children in `AppFrame`, and it is right about the app: Buddy is a phone app,
 * and stretching five tabs across 2000px would be worse on every screen. This
 * page is the exception the same file's reasoning implies — page.tsx already
 * notes that a phone app has users while the web has *visitors*, and a visitor
 * arrives before there is any app to frame. So the sections run the full width
 * and their contents are centred in `max-w-5xl`.
 *
 * **A server component, deliberately, like the screen it replaces.** This is the
 * first paint for everyone arriving without a session. A `'use client'` here
 * would put the whole page behind ~630 KiB of JS and ship blank HTML until
 * hydration; as a server component the markup and every call to action are in
 * the response, and the links work before a single byte of script has run.
 * **Interactive and animated, still without a byte of JavaScript.** The first
 * version said "no carousel, no accordion, no counters that animate on scroll"
 * and gave the bundle as the reason. The reason was right and the conclusion
 * was too broad. `<details name>` is an exclusive accordion the browser already
 * implements, and `animation-timeline: view()` is a scroll-driven animation
 * with no observer and no listener — so the features and questions open and
 * close, and sections rise as they arrive, on a server component, at no cost.
 * What stays banned is what would still need script: a scroll-spy nav, a
 * counter that has to count, a carousel needing a slide index.
 *
 * The motion rules live in globals.css and are all inside
 * `prefers-reduced-motion: no-preference`, so the page's default state is the
 * finished one — delete every animation and nothing disappears. The section nav is plain `#` anchors, which
 * the browser has handled since before JavaScript.
 *
 * A consequence worth knowing: every panel's markup is in the response whether
 * it is open or not, so the page is still one document to a crawler and still
 * readable with CSS off.
 *
 * **No images.** There are no marketing assets in the repo, and the CSP allows
 * images only from this origin and the API. Rather than commission stock photos
 * of students looking pleased near a laptop, the illustrations are static
 * mockups of the real interface built from the real design tokens — so what a
 * visitor is shown is what they will actually get, and it costs no bytes.
 *
 * **Every number comes from `@buddy/shared`.** The fact strip, the points
 * arithmetic and the counts in the feature copy are read from the same
 * constants the API enforces, rather than typed in. Rebalance the economy and
 * the pitch follows; there is no second copy to go stale. This is also the rule
 * that decides what the page is *allowed* to say — see the note on §5.7 in
 * ARCHITECTURE.md about the sections a competitor's page has and this one
 * cannot honestly have.
 */

/**
 * `linkButtonClass` bakes in `w-full`, which is right inside a phone column and
 * wrong for a landing page where two buttons sit side by side. The variants are
 * exported separately for exactly this, so the look still comes from one place.
 * `sm:w-auto` wins over `w-full` because Tailwind emits responsive utilities
 * after the base ones — see the ordering trap documented in buttonStyles.ts.
 */
function cta(variant: ButtonVariant): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} w-full cursor-pointer sm:w-auto`;
}

/**
 * The signup questionnaire's first question — the front door for a visitor.
 * Read from `SIGNUP_STEPS` rather than written out, because which question
 * comes first has already changed once: the age gate took the position from
 * `/start/level` in §2.8, and a hardcoded link would have quietly skipped it.
 */
const START: string = FIRST_STEP;

const REQUEST_MINUTES = BUDDY_REQUEST_TTL_MS / 60_000;

function Section({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    // `scroll-mt-14` is the sticky bar's height: without it an anchored jump
    // parks the heading underneath the header.
    <section id={id} className={`scroll-mt-14 px-5 py-16 sm:py-20 ${className}`}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <TopBar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <WhoItIsFor />
        <Details />
        <Questions />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

/**
 * The section links are hidden below `md`. A phone gets the wordmark and the
 * one button that matters; a five-item nav collapsed into a burger would need
 * client JS, which is the thing this page is built not to need.
 */
const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#details', label: 'Details' },
  { href: '#questions', label: 'Questions' },
];

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl flex-row items-center justify-between gap-6 px-5">
        <Link href="/" className="text-lg font-bold tracking-tight text-ink">
          Buddy
        </Link>

        <nav aria-label="Sections" className="hidden flex-1 flex-row gap-6 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-row items-center gap-2">
          <Link
            href="/login"
            className="hidden px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink sm:block"
          >
            Sign in
          </Link>
          <Link
            href={START}
            className={`${BUTTON_BASE} ${BUTTON_VARIANT.primary} h-10 cursor-pointer text-sm`}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The dark band is the one piece of the page that is not app chrome. The app is
 * white and indigo because it is a tool somebody looks at for an hour a day;
 * the landing page has about four seconds, and inverting the palette for the
 * top of it is what makes the product screenshot below read as a screenshot
 * rather than as more page.
 */
function Hero() {
  return (
    <div className="bg-ink px-5 pb-14 pt-16 sm:pt-20">
      <div className="mx-auto grid w-full max-w-5xl gap-12 md:grid-cols-2 md:items-center md:gap-10">
        <div className="flex flex-col">
          <p className="landing-rise text-sm font-semibold uppercase tracking-widest text-brand-muted/70">
            For students
          </p>
          {/*
            Two promises, because the product is two things and leading with
            only the second one undersold it. Finding somebody is the half most
            people arrive needing; finishing the work is the half that makes
            having found them worth anything.

            The second line names *what* gets finished. It read "Actually finish
            today", which is a mood rather than a claim — a visitor cannot tell
            what they would be finishing. "What you planned" is the thing the
            app actually holds, and it sets up the sentence below it.
          */}
          <h1
            className="landing-rise mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]"
            style={{ animationDelay: '80ms' }}
          >
            Find a study buddy.
            <br />
            <span className="text-brand-muted">Finish what you planned.</span>
          </h1>
          <p
            className="landing-rise mt-5 max-w-md text-lg leading-relaxed text-ink-subtle"
            style={{ animationDelay: '160ms' }}
          >
            Matched with students working toward the same thing as you — and nothing counts until
            one of them says it does.
          </p>

          <div
            className="landing-rise mt-8 flex flex-col gap-3 sm:flex-row"
            style={{ animationDelay: '240ms' }}
          >
            <Link href={START} className={cta('primary')}>
              Find my buddy
            </Link>
            <Link
              href="/login"
              className={`${BUTTON_BASE} w-full cursor-pointer border border-white/25 text-white transition-colors hover:bg-white/10 sm:w-auto`}
            >
              I already have an account
            </Link>
          </div>

          <p
            className="landing-rise mt-5 text-sm text-ink-subtle"
            style={{ animationDelay: '320ms' }}
          >
            In this browser. Nothing to install.
          </p>
        </div>

        <HeroMock />
      </div>
    </div>
  );
}

/** Small round avatar stand-in. The app draws initials when there is no photo. */
function Face({
  initials,
  tint = 'bg-brand-muted text-brand',
  size = 'h-10 w-10 text-xs',
}: {
  initials: string;
  tint?: string;
  size?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${tint} ${size}`}
    >
      {initials}
    </span>
  );
}

/**
 * A still of the group screen. Built from the same tokens the app uses, so it
 * cannot show a product that does not exist — and it is hidden from screen
 * readers, because a picture of an interface is not information, it is a
 * picture.
 */
function HeroMock() {
  return (
    <div
      aria-hidden="true"
      className="landing-rise mx-auto w-full max-w-sm rounded-xl border border-surface-border bg-surface p-4 shadow-2xl"
      style={{ animationDelay: '200ms' }}
    >
      <div className="flex flex-row items-baseline justify-between">
        <span className="text-base font-bold text-ink">📚 Finals week</span>
        <span className="text-xs text-ink-subtle">3 members</span>
      </div>

      {/* The member strip: who is in the group, and how each of them is doing. */}
      <div className="mt-3 flex flex-row gap-2">
        {[
          { name: 'You', initials: 'ME', status: '🎯', buddy: false },
          { name: 'Ana', initials: 'AN', status: '🧱', buddy: true },
          { name: 'Sam', initials: 'SA', status: null, buddy: false },
        ].map((member) => (
          <div
            key={member.name}
            className={`flex w-16 flex-col items-center gap-1 rounded-lg border px-1 py-2 ${
              member.name === 'You' ? 'border-brand bg-brand-muted' : 'border-transparent'
            }`}
          >
            <span className="relative">
              <Face initials={member.initials} size="h-9 w-9 text-[10px]" />
              {member.buddy ? (
                <span className="absolute -bottom-0.5 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-surface bg-brand text-[7px] font-bold text-brand-fg">
                  ✓
                </span>
              ) : null}
              {member.status ? (
                <span className="absolute -bottom-0.5 -right-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-surface bg-surface text-[8px]">
                  {member.status}
                </span>
              ) : null}
            </span>
            <span className="text-[10px] text-ink-muted">{member.name}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <MockTask title="Rewrite the methods section" meta="45 min" state="approved" />
        <MockTask title="Problem set 7, Q1–Q4" meta="Running · 12:04" state="running" />
        <MockTask title="Read two papers" meta="Waiting on Ana" state="waiting" />
      </div>

      <div className="mt-3 flex flex-row items-center justify-between rounded-lg bg-surface-muted px-3 py-2">
        <span className="text-xs text-ink-muted">Next badge · Seven days</span>
        <span className="text-xs font-semibold text-ink">5/7</span>
      </div>
    </div>
  );
}

function MockTask({
  title,
  meta,
  state,
}: {
  title: string;
  meta: string;
  state: 'approved' | 'running' | 'waiting';
}) {
  const dot = {
    approved: 'bg-success',
    // The only thing on the page that moves by itself, because it is the only
    // one claiming to be live. See `landing-pulse` in globals.css.
    running: 'bg-brand landing-pulse',
    waiting: 'bg-warning',
  }[state];

  return (
    <div className="flex flex-row items-center gap-3 rounded-lg border border-surface-border px-3 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-sm ${state === 'approved' ? 'text-ink-subtle line-through' : 'text-ink'}`}
        >
          {title}
        </span>
        <span className="text-[11px] text-ink-subtle">{meta}</span>
      </div>
      {state === 'approved' ? (
        <span className="shrink-0 text-xs font-semibold text-success">★★★★☆</span>
      ) : null}
    </div>
  );
}

/**
 * The mechanic, in five steps.
 *
 * It used to be four and started at "plan today", which quietly assumed the
 * hard part was already solved. It is not: most people arrive with nobody to be
 * accountable to, and the matching is half of what this product does. Finding
 * somebody is step one.
 *
 * Each card reveals as it scrolls in, with the delay coming from its position
 * so the row assembles left to right. `animation-timeline: view()` does that
 * with no observer and no script — see globals.css.
 */
function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Find someone',
      body: 'Matched on your goal first, then your campus, then your subject. Ask, and you know inside five minutes.',
    },
    {
      n: '2',
      title: 'Plan today',
      body: 'Not this term. Today. It resets at your midnight, in your timezone.',
    },
    {
      n: '3',
      title: 'Do it',
      body: 'Start the clock. While it runs, the group chat is closed to you.',
    },
    {
      n: '4',
      title: 'They check',
      body: `Your buddy approves it, rates it out of ${MAX_RATING}, or asks for proof.`,
    },
    {
      n: '5',
      title: 'The streak',
      body: 'Every approved day extends it. Miss one and it is back to nothing.',
    },
  ];

  return (
    <Section id="how" className="bg-surface">
      <h2 className="landing-reveal max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Someone to answer to, and something to answer for
      </h2>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <div
            key={step.n}
            className="landing-reveal flex flex-col"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-muted text-sm font-bold text-brand">
              {step.n}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-ink">{step.title}</h3>
            <p className="mt-1.5 text-base leading-relaxed text-ink-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * One feature, as a row that opens.
 *
 * `<details name="features">` is an *exclusive* accordion — opening one closes
 * the others — implemented by the browser, so this costs nothing and works with
 * JavaScript disabled. It replaces four stacked full-height sections with four
 * lines and one open panel, which is the whole point: the page is now scannable
 * in a glance instead of a scroll, and the words are read by people who asked
 * for them.
 *
 * `open` on the first is what stops the section reading as four dead headings.
 */
function Feature({
  title,
  eyebrow,
  body,
  mock,
  open = false,
}: {
  title: string;
  eyebrow: string;
  body: string;
  mock: ReactNode;
  open?: boolean;
}) {
  return (
    <details name="features" open={open} className="group border-b border-surface-border">
      <summary className="flex cursor-pointer list-none flex-row items-center gap-4 py-5 transition-colors hover:text-brand [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold uppercase tracking-widest text-brand">
          {eyebrow}
        </span>
        <span className="flex-1 text-lg font-semibold text-ink sm:text-xl">{title}</span>
        <span
          aria-hidden="true"
          className="shrink-0 text-ink-subtle transition-transform duration-200 group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="grid gap-8 pb-8 md:grid-cols-2 md:items-center">
        <p className="text-lg leading-relaxed text-ink-muted">{body}</p>
        <div>{mock}</div>
      </div>
    </details>
  );
}

function MockCard({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-sm rounded-xl border border-surface-border bg-surface p-4 shadow-xl"
    >
      {children}
    </div>
  );
}

/**
 * Four rows where there were four screens. Every bullet list is gone: they were
 * four items of forty words each, and a landing page is not documentation.
 * What survives is one sentence per feature and the picture, which is the part
 * that was doing the persuading anyway.
 */
function Features() {
  return (
    <Section id="features" className="bg-surface-muted">
      <h2 className="landing-reveal max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        What you get
      </h2>

      <div className="mt-8 border-t border-surface-border">
        <Feature
          open
          eyebrow="Find"
          title="Start with nobody. Leave with a group."
          body="Ranked by what you have in common — goal first, then campus, then subject. Ask, and you have an answer in five minutes."
          mock={
            <MockCard>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Recommended
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {[
                  { initials: 'PR', name: 'Priya R.', line: 'Same goal · same university' },
                  { initials: 'JO', name: 'Jonah T.', line: 'Same subject · active now' },
                  { initials: 'MK', name: 'Mei K.', line: 'Same goal · same country' },
                ].map((person) => (
                  <div
                    key={person.initials}
                    className="flex flex-row items-center gap-3 rounded-lg border border-surface-border px-3 py-2.5"
                  >
                    <Face initials={person.initials} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-ink">{person.name}</span>
                      <span className="truncate text-[11px] text-ink-subtle">{person.line}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-brand-fg">
                      Ask
                    </span>
                  </div>
                ))}
              </div>
            </MockCard>
          }
        />

        <Feature
          eyebrow="Review"
          title="Nobody marks their own homework"
          body={`Saying you did the reading is free. Having someone doing the same reading agree is not. Rating times ${CREDITS_PER_RATING_POINT}, plus ${DAILY_COMPLETION_BONUS} for a clean day.`}
          mock={
            <MockCard>
              <div className="flex flex-row items-center gap-3">
                <Face initials="AN" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-ink">Ana marked this done</span>
                  <span className="text-[11px] text-ink-subtle">Draft the intro · 50 min</span>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
                “Got through the intro and half the lit review.”
              </p>
              <div className="mt-3 flex flex-row items-center justify-between">
                <span className="text-lg tracking-widest text-warning">★★★★☆</span>
                <span className="text-xs font-semibold text-success">
                  +{4 * CREDITS_PER_RATING_POINT} points
                </span>
              </div>
              <div className="mt-3 flex flex-row gap-2">
                <span className="flex-1 rounded-md bg-brand py-2 text-center text-xs font-semibold text-brand-fg">
                  Approve
                </span>
                <span className="flex-1 rounded-md border border-surface-border py-2 text-center text-xs font-semibold text-ink-muted">
                  Ask for proof
                </span>
              </div>
            </MockCard>
          }
        />

        <Feature
          eyebrow="Focus"
          title="A chat that closes while you work"
          body={`Start your clock and the group chat locks — for you. The others carry on. ${STATUSES.length} one-tap statuses say how it is going; ${REACTIONS.length} reactions, all of them positive.`}
          mock={
            <MockCard>
              <div className="flex flex-row items-baseline justify-between">
                <span className="text-sm font-bold text-ink">📚 Finals week</span>
                <span className="text-[11px] text-ink-subtle">3 members</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-row items-end gap-2">
                  <Face initials="AN" size="h-7 w-7 text-[9px]" />
                  <span className="max-w-[75%] rounded-lg rounded-bl-sm bg-surface-muted px-3 py-2 text-xs text-ink">
                    Library at 7? I&rsquo;m stuck on Q3 🧱
                  </span>
                </div>
                <div className="flex flex-row justify-end">
                  <span className="max-w-[75%] rounded-lg rounded-br-sm bg-brand px-3 py-2 text-xs text-brand-fg">
                    Yes — starting my clock now
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-row items-center gap-2 rounded-lg border border-dashed border-surface-border bg-surface-muted px-3 py-2.5">
                <span className="text-sm">🔇</span>
                <span className="text-[11px] leading-snug text-ink-muted">
                  Your clock is running. Chat unlocks when you stop it.
                </span>
              </div>
            </MockCard>
          }
        />

        <Feature
          eyebrow="Keep going"
          title="Something to show for the weeks you turned up"
          body={`${BADGES.length} badges over ${BADGE_FAMILIES.length} ladders, and a standing among the few people who know whether you earned it.`}
          mock={
            <MockCard>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Streak</p>
              <div className="mt-2 flex flex-col divide-y divide-surface-border">
                <MockBadge emoji="✨" name="Three in a row" earned />
                <MockBadge emoji="📅" name="Seven days" current={5} target={7} />
                <MockBadge emoji="🏆" name="Thirty days" current={5} target={30} />
              </div>
            </MockCard>
          }
        />
      </div>
    </Section>
  );
}

function MockBadge({
  emoji,
  name,
  earned = false,
  current = 0,
  target = 1,
}: {
  emoji: string;
  name: string;
  earned?: boolean;
  current?: number;
  target?: number;
}) {
  return (
    <div className="flex flex-row items-start gap-3 py-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
          earned ? 'bg-brand-muted' : 'bg-surface-muted opacity-45 grayscale'
        }`}
      >
        {emoji}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-row items-baseline justify-between gap-2">
          <span className={`text-sm font-semibold ${earned ? 'text-ink' : 'text-ink-muted'}`}>
            {name}
          </span>
          {earned ? <span className="text-[11px] font-semibold text-success">Earned</span> : null}
        </div>
        {earned ? null : (
          <>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.round((current / target) * 100)}%` }}
              />
            </div>
            <span className="mt-1 text-[11px] text-ink-subtle">
              {current} of {target}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * This sits where a competitor's page runs its logo wall and its testimonials.
 * Buddy cannot fill that slot: there are no customers to quote and no
 * institutions to list, and the honest substitute for "look who else is here"
 * is "here is exactly who this is for" — read off the option lists the signup
 * questionnaire actually offers, so the answer stays true as those lists grow.
 */
function WhoItIsFor() {
  const goals = GOALS.filter((goal) => goal.key !== 'custom');

  return (
    <Section className="bg-ink">
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-start">
        <div className="flex flex-col">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-muted/70">
            Who it is for
          </p>
          <h2 className="landing-reveal mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Not only exam season
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-subtle">
            You are matched to people working toward the same thing, at the same level — from{' '}
            {EDUCATION_LEVELS[0]!.label.toLowerCase()} to{' '}
            {EDUCATION_LEVELS[EDUCATION_LEVELS.length - 1]!.label.toLowerCase()}.
          </p>
        </div>

        <ul className="flex flex-row flex-wrap gap-2">
          {goals.map((goal) => (
            <li
              key={goal.key}
              className="rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-medium text-white"
            >
              {goal.label}
            </li>
          ))}
          <li className="rounded-full border border-brand bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg">
            …or write your own
          </li>
        </ul>
      </div>
    </Section>
  );
}

/**
 * The small decisions, said plainly. A landing page usually buries these, and
 * they are the ones that tell somebody whether the product was built by people
 * who had thought about the problem.
 */
function Details() {
  const details = [
    {
      emoji: '🌅',
      title: 'A nudge at 8am, only if you need one',
      body: 'Nothing planned when your day starts? Buddy says so once, then leaves you alone.',
    },
    {
      emoji: '🕓',
      title: 'Nobody is punished for a silent reviewer',
      body: 'An unchecked task closes itself after a full extra day. Your streak survives.',
    },
    {
      emoji: '🌍',
      title: 'Your day, not a server’s day',
      body: 'Midnight means yours. A group can span three timezones and each gets a full day.',
    },
    {
      emoji: '🚪',
      title: 'Walking away costs something, but never everything',
      body: `Abandoning a started task costs ${ABANDON_PENALTY} points, capped at what you have. Nobody goes into debt.`,
    },
    {
      emoji: '⏱️',
      title: `Between ${MIN_TASK_MINUTES} minutes and ${MAX_TASK_MINUTES / 60} hours`,
      body: 'Below that is not worth a clock. Above it, a “task” is really a day’s plan.',
    },
    {
      emoji: '🔗',
      title: 'An invite link that expires',
      body: `Anyone holding it can join, so it is bounded both ways: ${INVITE_LINK_MAX_USES} uses, one week.`,
    },
  ];

  return (
    <Section id="details" className="bg-surface">
      <h2 className="landing-reveal max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        The details we argued about
      </h2>
      <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {details.map((detail) => (
          <div key={detail.title} className="flex flex-col">
            <span aria-hidden="true" className="text-2xl">
              {detail.emoji}
            </span>
            <h3 className="mt-2.5 text-base font-semibold text-ink">{detail.title}</h3>
            <p className="mt-1 text-base leading-relaxed text-ink-muted">{detail.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * The same `<details name>` trick as the features. The earlier version argued
 * that four short answers were better left open than hidden behind a click —
 * true when they were four paragraphs, and the fix was to make them one line
 * each rather than to leave four paragraphs lying on the page.
 */
function Questions() {
  const questions = [
    {
      q: 'Do I have to install anything?',
      a: 'No. Buddy runs in this browser. Phone apps are being built; there is nothing to download yet, so the page does not pretend there is.',
    },
    {
      q: 'What if I don’t know anybody here?',
      a: `That is the case it is built for. Strangers are ranked by your goal, then your campus, then your subject, and a request lapses after ${REQUEST_MINUTES} minutes so you are never left waiting.`,
    },
    {
      q: 'What if my group never reviews my work?',
      a: 'Your streak is not theirs to break. An unreviewed task closes itself after a full extra day and the day still counts. It earns nothing, because nobody actually looked.',
    },
    {
      q: 'Is it only for exams?',
      a: `No — ${GOALS.length - 1} goals, from a thesis to job hunting, fitness, a language or a reading habit. Plus a box you fill in yourself.`,
    },
    {
      q: `Who can join?`,
      a: `Anyone ${MIN_AGE_YEARS} or over. Signup asks your date of birth first, before anything else.`,
    },
  ];

  return (
    <Section id="questions" className="bg-surface-muted">
      <h2 className="landing-reveal max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Reasonable questions
      </h2>

      <div className="mt-8 border-t border-surface-border">
        {questions.map((item) => (
          <details key={item.q} name="questions" className="group border-b border-surface-border">
            <summary className="flex cursor-pointer list-none flex-row items-center gap-4 py-4 text-base font-semibold text-ink transition-colors hover:text-brand [&::-webkit-details-marker]:hidden sm:text-lg">
              <span className="flex-1">{item.q}</span>
              <span
                aria-hidden="true"
                className="shrink-0 text-ink-subtle transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="max-w-2xl pb-5 text-base leading-relaxed text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Closing() {
  return (
    <div className="bg-brand px-5 py-16 sm:py-20">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h2 className="text-3xl font-bold tracking-tight text-brand-fg sm:text-4xl">
          Decide what today is for
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-brand-muted">
          A few questions, and you are in a group the same evening.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href={START}
            className={`${BUTTON_BASE} w-full cursor-pointer bg-surface text-brand hover:bg-surface/90 sm:w-auto`}
          >
            Get started
          </Link>
          <Link
            href="/login"
            className={`${BUTTON_BASE} w-full cursor-pointer border border-white/40 text-brand-fg transition-colors hover:bg-white/10 sm:w-auto`}
          >
            Sign in
          </Link>
        </div>
        {/*
          "For now, the web app" — said on the page rather than left for someone
          to discover. There is an Expo client in the repo, and until it ships
          promising it here would be a lie with a download button on it.
        */}
        <p className="mt-6 text-sm text-brand-muted">
          Buddy runs in your browser today. iPhone and Android apps are on the way.
        </p>
      </div>
    </div>
  );
}

/**
 * Three columns rather than a competitor's seven. Every link here resolves to a
 * route that exists: there is no /about, /pricing, /careers or /privacy in this
 * app, and a footer column of dead links is worse than a short footer.
 */
function Footer() {
  const columns = [
    {
      heading: 'Get started',
      links: [
        { href: START, label: 'Create an account' },
        { href: '/login', label: 'Sign in' },
        { href: '/forgot', label: 'Forgot your password' },
      ],
    },
    {
      heading: 'How it works',
      links: [
        { href: '#how', label: 'The four steps' },
        { href: '#features', label: 'Features' },
        { href: '#details', label: 'Details' },
        { href: '#questions', label: 'Questions' },
      ],
    },
  ];

  return (
    <footer className="bg-ink px-5 py-12">
      <div className="mx-auto grid w-full max-w-5xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col lg:col-span-2">
          <span className="text-base font-bold text-white">Buddy</span>
          <span className="mt-1 max-w-xs text-sm leading-relaxed text-ink-subtle">
            Plan it, finish it, have somebody check. Accountability for people who study alone and
            would rather not.
          </span>
        </div>

        {columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
              {column.heading}
            </span>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith('#') ? (
                    <a
                      href={link.href}
                      className="text-sm text-ink-subtle transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-ink-subtle transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto mt-10 w-full max-w-5xl border-t border-white/10 pt-6">
        <span className="text-xs text-ink-muted">
          Buddy runs in your browser. iPhone and Android apps are on the way.
        </span>
      </div>
    </footer>
  );
}
