import Link from 'next/link';
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
 * Nothing here is interactive for exactly that reason — no carousel, no
 * accordion, no counters that animate on scroll. The section nav in the top bar
 * is plain `#` anchors, which the browser has handled since before JavaScript.
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

/** The signup questionnaire's first question — the front door for a visitor. */
const START = '/start/level';

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
            <Link href={START} className={cta('primary')}>
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
            Opens in this browser. Nothing to install, no card, no invite code.
          </p>
        </div>

        <HeroMock />
      </div>

      <FactStrip />
    </div>
  );
}

/**
 * Where a competitor's hero puts "500+ universities · 3m+ students", this puts
 * four facts about the product. Buddy has no institutions to name and no users
 * to count yet, and a made-up number in this position is the single fastest way
 * to deserve nobody's trust. Every figure here is read from `@buddy/shared`,
 * which is the same rule the rest of the page follows.
 */
function FactStrip() {
  const facts = [
    { value: String(BADGES.length), label: `badges, over ${BADGE_FAMILIES.length} ladders` },
    { value: `${REQUEST_MINUTES} min`, label: 'to answer a buddy request, or it lapses' },
    { value: String(EDUCATION_LEVELS.length), label: 'levels, from high school to postdoc' },
    { value: '0', label: 'downloads — it runs in your browser' },
  ];

  return (
    <dl className="mx-auto mt-16 grid w-full max-w-5xl grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-10 lg:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col">
          <dt className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{fact.value}</dt>
          <dd className="mt-1 text-sm leading-snug text-ink-subtle">{fact.label}</dd>
        </div>
      ))}
    </dl>
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
      body: `Mark it done and a groupmate approves it, rates it out of ${MAX_RATING}, or asks you for proof. Nobody marks their own.`,
    },
    {
      n: '4',
      title: 'The streak',
      body: 'Every approved day extends it. Miss one and it goes back to nothing, which is exactly as annoying as it sounds.',
    },
  ];

  return (
    <Section id="how" className="bg-surface">
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
  id,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  mock: ReactNode;
  flip?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <Section id={id} className={className}>
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

/**
 * Four of them, in the shape a landing page for something like this usually
 * takes: alternating sides, a still of the real screen beside each. What is
 * missing on purpose is the per-section "Learn more" link — those go to product
 * pages Buddy does not have, and a link into a 404 is worse than no link.
 */
function Features() {
  return (
    <>
      <Feature
        id="features"
        className="bg-surface-muted"
        eyebrow="Finding someone"
        title="Start with nobody. Leave with a group."
        body="You do not need to already know somebody who studies the way you do. The directory ranks people by what you actually have in common, strongest signal first."
        points={[
          'Matched on your goal, then your institution, then your subject — in that order, so a shared goal always outranks three coincidences.',
          'Filter by level, subject, country, or just “same institution as me”.',
          `Send a request and it is answered within ${REQUEST_MINUTES} minutes, or it lapses and you try someone else.`,
          'Already have friends? Make a group and send them a join link.',
        ]}
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
          `Approve with a rating from zero to ${MAX_RATING}, or send it back and ask for proof.`,
          `Points are the rating times ${CREDITS_PER_RATING_POINT}, plus ${DAILY_COMPLETION_BONUS} when every task you planned that day gets approved.`,
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
              <span className="text-xs font-semibold text-success">
                +{4 * CREDITS_PER_RATING_POINT} points
              </span>
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
        eyebrow="Your group"
        title="A chat that closes while you work"
        body="A group is a few people, not a forum. It is where somebody notices your plan in the morning and asks about it in the evening — and it gets out of your way the moment you start."
        points={[
          'Start a task and the chat locks for you until you stop it. The others can still talk. You cannot, and that is the feature.',
          `${STATUSES.length} one-tap statuses — heads down, stuck, need a push — that your group can see until your midnight.`,
          `Bring people you already know with an invite link: ${INVITE_LINK_MAX_USES} uses, good for a week.`,
          `A feed for a photo of what you are working on, with ${REACTIONS.length} reactions and every one of them positive.`,
        ]}
        mock={
          <MockCard>
            <div className="flex flex-row items-baseline justify-between">
              <span className="text-sm font-bold text-ink">📚 Finals week</span>
              <span className="text-[11px] text-ink-subtle">3 members</span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-row items-end gap-2">
                <Face initials="AN" size="h-7 w-7 text-[9px]" />
                <span className="max-w-[75%] rounded-2xl rounded-bl-md bg-surface-muted px-3 py-2 text-xs text-ink">
                  Library at 7? I&rsquo;m stuck on Q3 🧱
                </span>
              </div>
              <div className="flex flex-row justify-end">
                <span className="max-w-[75%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-xs text-brand-fg">
                  Yes — starting my clock now
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-row items-center gap-2 rounded-2xl border border-dashed border-surface-border bg-surface-muted px-3 py-2.5">
              <span className="text-sm">🔇</span>
              <span className="text-[11px] leading-snug text-ink-muted">
                Your clock is running. Chat unlocks when you stop it.
              </span>
            </div>
          </MockCard>
        }
      />

      <Feature
        flip
        eyebrow="Keeping it up"
        title="Something to show for the weeks you did turn up"
        body="Points on their own are a number. They turn into badges you can see coming, and into a standing among the few people who actually know whether you earned it."
        points={[
          `${BADGE_FAMILIES.length} ladders — tasks approved, points, streak, reviews given — and ${BADGES.length} badges across them, each locked one showing how far off it is.`,
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
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Not only exam season
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-subtle">
            Signup asks what you are working toward and matches you to people working toward the
            same thing. These are the answers it offers, and one of them is a box you write
            yourself.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink-subtle">
            It asks your level too — {EDUCATION_LEVELS.map((level) => level.label).join(', ')} —
            because a first-year and a postdoc do not want the same week.
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
      body: 'If you have nothing planned when your morning starts, Buddy says so once. If you have, it stays quiet.',
    },
    {
      emoji: '🕓',
      title: 'Nobody is punished for a silent reviewer',
      body: 'A task you finished that nobody checks gets the reviewer a full extra day, then closes itself. The day counts and your streak survives.',
    },
    {
      emoji: '🌍',
      title: 'Your day, not a server’s day',
      body: 'Midnight means your midnight. A group can span three timezones and everybody still gets their own full day.',
    },
    {
      emoji: '🚪',
      title: 'Walking away costs something, but never everything',
      body: `Abandoning a task you started is ${ABANDON_PENALTY} points — one rating point's worth. It is capped at what you have, so nobody ends up in debt.`,
    },
    {
      emoji: '⏱️',
      title: `Between ${MIN_TASK_MINUTES} minutes and ${MAX_TASK_MINUTES / 60} hours`,
      body: 'Shorter than that is not worth starting a clock for. Longer and a “task” is really a day’s plan, and the clock stops telling anyone anything.',
    },
    {
      emoji: '🔗',
      title: 'An invite link that expires',
      body: `Anyone holding the link can join, so it is bounded on both axes: ${INVITE_LINK_MAX_USES} uses, and a week.`,
    },
  ];

  return (
    <Section id="details" className="bg-surface">
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

/**
 * Plain headings and paragraphs rather than a `<details>` accordion. The
 * questions are four, they are short, and a visitor who has scrolled this far
 * is reading — hiding the answers behind a click would only cost them a click.
 */
function Questions() {
  const questions = [
    {
      q: 'Do I have to install anything?',
      a: 'No. Buddy runs in this browser, on a laptop or a phone, and “Get started” goes straight into signup. The iPhone and Android apps are being built; there is nothing to download yet, so the page does not pretend there is.',
    },
    {
      q: 'What if I don’t know anybody on here?',
      a: `That is the case it is built for. The directory ranks strangers by your goal first, then your institution, then your subject, and a request is answered within ${REQUEST_MINUTES} minutes or it lapses so you are never left waiting on somebody who has gone quiet.`,
    },
    {
      q: 'What if my group never reviews my work?',
      a: 'Your streak is not theirs to break. An unreviewed task gives the reviewer a full extra day and then closes on its own — the day still counts. It earns no points, because nobody actually looked, and an unreviewed approval would be an absence pretending to be a reviewer.',
    },
    {
      q: 'Is it only for exams?',
      a: `No. The goals list runs from finals and a thesis to job hunting, a side project, fitness, a language or a reading habit — ${GOALS.length - 1} of them, plus a box you fill in yourself.`,
    },
  ];

  return (
    <Section id="questions" className="bg-surface-muted">
      <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Reasonable questions
      </h2>
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
        {questions.map((item) => (
          <div key={item.q} className="flex flex-col">
            <h3 className="text-lg font-semibold text-ink">{item.q}</h3>
            <p className="mt-2 text-base leading-relaxed text-ink-muted">{item.a}</p>
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
