import Link from 'next/link';
import type { ReactNode } from 'react';

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
 * hydration; as a server component the markup and both calls to action are in
 * the response, and the links work before a single byte of script has run.
 * Nothing here is interactive for exactly that reason — no carousel, no
 * accordion, no counters that animate on scroll.
 *
 * **No images.** There are no marketing assets in the repo, and the CSP allows
 * images only from this origin and the API. Rather than commission stock photos
 * of students looking pleased near a laptop, the illustrations are static
 * mockups of the real interface built from the real design tokens — so what a
 * visitor is shown is what they will actually get, and it costs no bytes.
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

function Section({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-5 py-16 sm:py-20 ${className}`}>
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
        <Details />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-row items-center justify-between px-5 py-3">
        <span className="text-lg font-bold tracking-tight text-ink">Buddy</span>
        <div className="flex flex-row items-center gap-2">
          <Link
            href="/login"
            className="hidden px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/start/level"
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
    <div className="bg-ink px-5 pb-20 pt-16 sm:pb-24 sm:pt-20">
      <div className="mx-auto grid w-full max-w-5xl gap-12 md:grid-cols-2 md:items-center md:gap-10">
        <div className="flex flex-col">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-muted/70">
            For students
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
            Say what you&rsquo;ll finish today.
            <br />
            <span className="text-brand-muted">Have someone check.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-subtle">
            Deciding to work is easy on your own. Finishing is not. Buddy pairs you with people
            doing the same thing, and nothing counts until one of them says it does.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/start/level" className={cta('primary')}>
              Get started
            </Link>
            <Link
              href="/login"
              className={`${BUTTON_BASE} w-full cursor-pointer border border-white/25 text-white transition-colors hover:bg-white/10 sm:w-auto`}
            >
              I already have an account
            </Link>
          </div>

          <p className="mt-5 text-sm text-ink-subtle">
            Runs in your browser. Nothing to install.
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
      className="mx-auto w-full max-w-sm rounded-3xl border border-surface-border bg-surface p-4 shadow-2xl"
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
            className={`flex w-16 flex-col items-center gap-1 rounded-2xl border px-1 py-2 ${
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

      <div className="mt-3 flex flex-row items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
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
    running: 'bg-brand',
    waiting: 'bg-warning',
  }[state];

  return (
    <div className="flex flex-row items-center gap-3 rounded-2xl border border-surface-border px-3 py-2.5">
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
 * The mechanic, in four steps. This is the section that has to do the work a
 * competitor's page does with logos and yield statistics: Buddy is new, it has
 * no universities to name and no numbers to quote, and inventing either would
 * be the fastest way to deserve none. What it does have is a loop that can be
 * explained in four lines, so it is explained in four lines.
 */
function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Plan today',
      body: 'Write what you will actually finish today. Not this term — today. It resets at your midnight, in your timezone.',
    },
    {
      n: '2',
      title: 'Do it',
      body: 'Start the clock when you start working. While it runs you are out of the group chat, which is the point.',
    },
    {
      n: '3',
      title: 'Someone checks',
      body: 'Mark it done and a groupmate approves it, rates it out of five, or asks you for proof. Nobody marks their own.',
    },
    {
      n: '4',
      title: 'The streak',
      body: 'Every approved day extends it. Miss one and it goes back to nothing, which is exactly as annoying as it sounds.',
    },
  ];

  return (
    <Section className="bg-surface">
      <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Four steps, and the third one is the whole idea
      </h2>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div key={step.n} className="flex flex-col">
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

/** One feature: words on one side, a still of the real screen on the other. */
function Feature({
  eyebrow,
  title,
  body,
  points,
  mock,
  flip = false,
  className = '',
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  mock: ReactNode;
  flip?: boolean;
  className?: string;
}) {
  return (
    <Section className={className}>
      <div
        className={`grid gap-10 md:grid-cols-2 md:items-center ${flip ? 'md:[&>*:first-child]:order-2' : ''}`}
      >
        <div className="flex flex-col">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-muted">{body}</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {points.map((point) => (
              <li key={point} className="flex flex-row gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                />
                <span className="text-base text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>{mock}</div>
      </div>
    </Section>
  );
}

function MockCard({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-sm rounded-3xl border border-surface-border bg-surface p-4 shadow-xl"
    >
      {children}
    </div>
  );
}

function Features() {
  return (
    <>
      <Feature
        className="bg-surface-muted"
        eyebrow="Finding someone"
        title="Start with nobody. Leave with a group."
        body="You do not need to already know somebody who studies the way you do. The directory ranks people by what you actually have in common, strongest signal first."
        points={[
          'Matched on your goal, then your institution, then your subject — in that order, so a shared goal always outranks three coincidences.',
          'Filter by level, subject, country, or just “same institution as me”.',
          'Send a request and it is answered within five minutes, or it lapses and you try someone else.',
          'Already have friends? Make a group and send them a join link.',
        ]}
        mock={
          <MockCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Recommended
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {[
                { initials: 'PR', name: 'Priya R.', line: 'Same goal · same university', pts: '1,240' },
                { initials: 'JO', name: 'Jonah T.', line: 'Same subject · active now', pts: '860' },
                { initials: 'MK', name: 'Mei K.', line: 'Same goal · same country', pts: '310' },
              ].map((person) => (
                <div
                  key={person.initials}
                  className="flex flex-row items-center gap-3 rounded-2xl border border-surface-border px-3 py-2.5"
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
        flip
        eyebrow="The review loop"
        title="Nobody marks their own homework"
        body="This is the part that makes the rest mean anything. Saying you did the reading is free. Having somebody who is doing the same reading agree that you did it is not."
        points={[
          'Approve with a rating from zero to five, or send it back and ask for proof.',
          'Points are the rating times ten, plus twenty when every task you planned that day gets approved.',
          'A zero still closes the task and keeps your streak. It just earns nothing.',
          'One group member is the Buddy — the person whose job it is to check — and only the group’s creator or the Buddy can hand that over.',
        ]}
        mock={
          <MockCard>
            <div className="flex flex-row items-center gap-3">
              <Face initials="AN" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-ink">Ana marked this done</span>
                <span className="text-[11px] text-ink-subtle">Draft the intro · 50 min</span>
              </div>
            </div>
            <p className="mt-3 rounded-2xl bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
              “Got through the intro and half the lit review — pushed the rest to tomorrow.”
            </p>
            <div className="mt-3 flex flex-row items-center justify-between">
              <span className="text-lg tracking-widest text-warning">★★★★☆</span>
              <span className="text-xs font-semibold text-success">+40 points</span>
            </div>
            <div className="mt-3 flex flex-row gap-2">
              <span className="flex-1 rounded-xl bg-brand py-2 text-center text-xs font-semibold text-brand-fg">
                Approve
              </span>
              <span className="flex-1 rounded-xl border border-surface-border py-2 text-center text-xs font-semibold text-ink-muted">
                Ask for proof
              </span>
            </div>
          </MockCard>
        }
      />

      <Feature
        className="bg-surface-muted"
        eyebrow="Keeping it up"
        title="Something to show for the weeks you did turn up"
        body="Points on their own are a number. They turn into badges you can see coming, and into a standing among the four people who actually know whether you earned it."
        points={[
          'Four ladders — tasks approved, points, streak, reviews given — with every locked badge showing how far off it is.',
          'A group board as well as a global one. Being ahead of the person who approves your work means more than being 4,312nd.',
          'Everyone in a group appears, including on zero, and equal scores share a place.',
        ]}
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
    </>
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
          {earned ? (
            <span className="text-[11px] font-semibold text-success">Earned</span>
          ) : null}
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
 * The small decisions, said plainly. A landing page usually buries these, and
 * they are the ones that tell somebody whether the product was built by people
 * who had thought about the problem.
 */
function Details() {
  const details = [
    {
      emoji: '🔇',
      title: 'You cannot chat while your own clock is running',
      body: 'The group chat is closed to you until you stop the timer. An accountability app whose chat is the distraction has beaten itself.',
    },
    {
      emoji: '🌅',
      title: 'A nudge at 8am, only if you need one',
      body: 'If you have nothing planned when your morning starts, Buddy says so once. If you have, it stays quiet.',
    },
    {
      emoji: '💬',
      title: 'Say how today is going in one tap',
      body: 'Heads down, stuck, need a push. Your group sees it until midnight, so they know whether to leave you alone or send something.',
    },
    {
      emoji: '🕓',
      title: 'Nobody is punished for a silent reviewer',
      body: 'If a task you finished goes unchecked, it closes itself after a day. The day counts and your streak survives.',
    },
    {
      emoji: '🌍',
      title: 'Your day, not a server’s day',
      body: 'Midnight means your midnight. A group can span three timezones and everybody still gets their own full day.',
    },
    {
      emoji: '📷',
      title: 'A feed, with no way to boo',
      body: 'Post a photo of what you are working on. Reactions are a fixed, positive set — this app already lets people rate your work.',
    },
  ];

  return (
    <Section className="bg-surface">
      <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
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

function Closing() {
  return (
    <div className="bg-brand px-5 py-16 sm:py-20">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h2 className="text-3xl font-bold tracking-tight text-brand-fg sm:text-4xl">
          Decide what today is for
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-brand-muted">
          A few questions about what you study and what you are working toward, and you are in a
          group the same evening.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/start/level"
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

function Footer() {
  return (
    <footer className="bg-ink px-5 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <span className="text-base font-bold text-white">Buddy</span>
          <span className="text-sm text-ink-subtle">
            Plan it, finish it, have somebody check.
          </span>
        </div>
        <div className="flex flex-row gap-5">
          <Link
            href="/start/level"
            className="text-sm font-semibold text-ink-subtle transition-colors hover:text-white"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-ink-subtle transition-colors hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
