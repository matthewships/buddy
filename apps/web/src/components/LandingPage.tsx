import Link from 'next/link';

import { FIRST_STEP, TASK_PARAM } from '@/onboarding/steps';
import type { ReactNode } from 'react';

import {
  ABANDON_PENALTY,
  BUDDY_REQUEST_TTL_MS,
  CREDITS_PER_RATING_POINT,
  DAILY_COMPLETION_BONUS,
  EDUCATION_LEVELS,
  GOALS,
  MAX_RATING,
  MAX_TASK_MINUTES,
  MAX_TASK_TITLE,
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
 * and their contents sit on one twelve-column grid inside `max-w-6xl`.
 *
 * **A server component, deliberately, like the screen it replaces.** This is the
 * first paint for everyone arriving without a session. A `'use client'` here
 * would put the whole page behind ~630 KiB of JS and ship blank HTML until
 * hydration; as a server component the markup and every call to action are in
 * the response, and the links work before a single byte of script has run.
 *
 * **The hero is a form, not a button (§2.9).** The single most effective thing
 * a product page can do is let the visitor *do the product* before signing up
 * — Duolingo's first lesson, Airbnb's search box — and Buddy's product is one
 * sentence: what will you finish today? So the hero asks it. A plain
 * `<form method="get">` posts the answer to the first signup step as
 * `?task=`, where `TaskFromQuery` writes it into the draft; the task is
 * on the visitor's desk before they have finished reading the verification
 * email.
 *
 * **One object (2026-09-04).** The page has one drawing of the product: the
 * desk, with a task and its clock running, beside the question in the hero,
 * cropped by the viewport's edge so it reads as something happening rather
 * than something framed. The story of one Tuesday shows only what that desk
 * gains after the clock stops. Nothing else on the page is a picture. The desk is built from the app's own tokens,
 * so it cannot show a product that does not exist, and it is hidden from
 * screen readers because a picture of an interface is a picture.
 *
 * **What is not on it.** No images (there are no marketing assets, and the CSP
 * allows images only from this origin and the API), no icons, no emoji, no
 * tracked-out labels, no strip of big numbers, no accordions, no card grids.
 * Each of those is a thing every landing page has, and together they said
 * what kind of page this was before a word had been read.
 *
 * **Two grounds.** Ink for the ask and for who it is for — the headline, the
 * desk, and then the wall of goals, the largest type on the page after the
 * clock, before a word of explanation. Then cream, at a reading size, for
 * everything that explains: one Tuesday as a log beside the desk, five rules
 * at display size, the questions two-up. No two of those share a shape. Then
 * ink again for the question asked a second time. Body text is 18px on one
 * measure; the page is read, not scanned.
 *
 * **Every number comes from `@buddy/shared`.** The times on the Tuesday are
 * invented; every count, cap and point value is read from the constants the
 * API enforces. Rebalance the economy and the pitch follows. This is also the
 * rule that decides what the page is *allowed* to say — see §5.7 in
 * ARCHITECTURE.md about the sections a competitor's page has and this one
 * cannot honestly have.
 *
 * **Two greens, each with one meaning.** Lime is a thing that can be pressed,
 * and the dot on a clock that is running: it means *go*, nothing else. Olive
 * is the clock's digits and the points a clock turns into, and nothing else —
 * numerals, faces and bars are ink. `success`, `live` and `people` are not
 * used here, and neither is the corner bracket — on a page this long it
 * stopped marking the thing that matters and became a pattern.
 *
 * The motion rules live in globals.css and are all inside
 * `prefers-reduced-motion: no-preference`, so the page's default state is the
 * finished one — delete every animation and nothing disappears.
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

/** The grid every section shares: one left edge, one right edge. */
const GRID = 'mx-auto w-full max-w-6xl';

/**
 * A panel whose contents stop at the grid's right edge while its surface runs
 * on to the viewport's: a pseudo-element the panel's own colour, hung off its
 * right side. No arithmetic on the viewport, so nothing to get wrong.
 */
const BLEED_RIGHT =
  'relative lg:after:absolute lg:after:left-full lg:after:top-0 lg:after:h-full lg:after:w-[50vw] lg:after:bg-surface-muted';

/** The display face at its largest optical size, for the biggest lines. */
const DISPLAY_OPSZ = { fontVariationSettings: '"opsz" 96' } as const;

/** The two heading sizes, and the one body size. */
const H2 = 'text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl';
const H3 = 'text-xl font-semibold leading-snug';
const BODY = 'text-lg leading-relaxed';

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
    <section id={id} className={`scroll-mt-14 px-6 ${className}`}>
      <div className={GRID}>{children}</div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-surface">
      <TopBar />
      <main className="flex-1">
        <Hero />
        <WhoItIsFor />
        <Tuesday />
        <Rules />
        <Questions />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

/**
 * The section links are hidden below `md`. A phone gets the wordmark and the
 * one button that matters; a nav collapsed into a burger would need client JS,
 * which is the thing this page is built not to need.
 */
const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#rules', label: 'The rules' },
  { href: '#questions', label: 'Questions' },
];

function Wordmark({ className = 'text-ink' }: { className?: string }) {
  return (
    <span className={`font-display text-xl font-bold tracking-tight ${className}`}>
      Buddy<span className="text-accent">.</span>
    </span>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 bg-ink/90 px-6 text-white backdrop-blur">
      <div className={`${GRID} flex h-14 flex-row items-center justify-between gap-6`}>
        <Link href="/">
          <Wordmark className="text-white" />
        </Link>

        <nav aria-label="Sections" className="hidden flex-1 flex-row gap-7 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-row items-center gap-2">
          <Link
            href="/login"
            className="hidden px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white sm:block"
          >
            Sign in
          </Link>
          <Link
            href={START}
            className={`${BUTTON_BASE} ${BUTTON_VARIANT.primary} h-9 cursor-pointer px-4 text-sm`}
          >
            Start my day
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The question, as a form. Used twice — in the hero and in the closing band —
 * because the second one catches the reader who scrolled past the first while
 * deciding, and by then they have an answer. Both bands are ink, so the button
 * is lime both times: one call to action, one colour.
 *
 * `required` is the only validation: the step it lands on has the real one,
 * and a browser's own "please fill in this field" is enough here. `maxLength`
 * is the task title's cap so nothing typed here is cut on the way in.
 */
function TaskForm({ id, placeholder }: { id: string; placeholder: string }) {
  return (
    <form method="get" action={START} className="flex w-full flex-col gap-2 sm:flex-row">
      <label htmlFor={id} className="sr-only">
        What will you finish today?
      </label>
      <input
        id={id}
        name={TASK_PARAM}
        type="text"
        required
        maxLength={MAX_TASK_TITLE}
        autoComplete="off"
        placeholder={placeholder}
        className="h-12 min-w-0 flex-1 rounded-md border border-white/25 bg-white/5 px-4 text-base text-white outline-none transition-colors placeholder:text-white/40 focus:border-accent"
      />
      <button type="submit" className={`${cta('primary')} shrink-0`}>
        Start my day
      </button>
    </form>
  );
}

/**
 * The dark band is the one piece of the page that is not app chrome. The app is
 * cream and olive because it is a tool somebody looks at for an hour a day; the
 * landing page has about four seconds, and inverting the palette for the top of
 * it is what makes the product beside it read as a screenshot rather than as
 * more page.
 *
 * The headline is two lines across the whole measure, one colour, one weight.
 * Under it the question takes the left five columns and the desk the right
 * seven, its surface running to the viewport's edge with its contents kept on
 * the grid: a product does not stop at the margin of the page describing it.
 */
function Hero() {
  return (
    <div className="bg-ink px-6 pb-8 pt-12 text-white sm:pt-16">
      <div className={GRID}>
        <p className="landing-rise text-sm font-medium text-accent">
          For students who study alone and would rather not.
        </p>
        <h1
          className="landing-rise mt-4 text-[2.75rem] font-bold leading-[0.96] tracking-[-0.025em] sm:text-6xl lg:text-[4.75rem]"
          style={{ animationDelay: '80ms', ...DISPLAY_OPSZ }}
        >
          Say what you&rsquo;ll finish today.
          <br />
          Then have someone check.
        </h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="flex flex-col lg:col-span-5">
            <p
              className={`landing-rise ${BODY} max-w-md text-white/80`}
              style={{ animationDelay: '160ms' }}
            >
              Buddy pairs you with a student working toward the same thing. You plan one day at a
              time, put a clock on it, and they sign it off. The streak is the score.
            </p>
            <div className="landing-rise mt-8 max-w-lg" style={{ animationDelay: '240ms' }}>
              <TaskForm id="hero-task" placeholder="Problem set 7, questions 1 to 4" />
            </div>
            <p
              className="landing-rise mt-3 text-sm text-white/70"
              style={{ animationDelay: '320ms' }}
            >
              Free, in your browser.{' '}
              <Link href="/login" className="underline underline-offset-4 hover:text-white">
                Already here? Sign in.
              </Link>
            </p>
          </div>

          <div className="lg:col-span-7">
            <Desk className={`landing-rise ${BLEED_RIGHT}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small round avatar stand-in, in ink. */
function Face({ initials, className = 'h-7 w-7' }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white ${className}`}
    >
      {initials}
    </span>
  );
}

/**
 * The desk, with the clock running at 11:22. Drawn once. Square, no border,
 * no shadow; rows divided by hairlines, never boxed. The clock is the only
 * thing on the page in the olive.
 */
function Desk({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`bg-surface-muted px-6 py-5 text-ink sm:px-8 sm:py-6 ${className}`}>
      <div className="flex flex-row items-center justify-between border-b border-surface-border pb-4">
        <span className="font-display text-lg font-bold">Ana&rsquo;s desk</span>
        <span className="flex flex-row items-center gap-3 text-sm text-ink-muted">
          <span className="flex flex-row gap-1">
            <Face initials="AN" />
            <Face initials="SA" />
            <Face initials="MK" />
          </span>
          Tuesday 11:22
        </span>
      </div>

      <div className="grid gap-6 pt-6 lg:grid-cols-12 lg:items-center lg:gap-6">
        <div className="flex flex-col lg:col-span-6">
          <div className="flex flex-row items-center gap-3">
            <span className="landing-pulse h-3 w-3 shrink-0 rounded-sm bg-accent" />
            <span className="text-2xl font-semibold">Problem set 7, Q1–Q4</span>
          </div>
          <span className="mt-2 text-base text-ink-muted">Started 10:40 · 90 min · Sam checks it</span>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-surface-border">
            <div className="h-full w-[58%] rounded-full bg-ink" />
          </div>
          <div className="mt-2 flex flex-row justify-between text-sm tabular-nums text-ink-muted">
            <span>52 min in</span>
            <span>38 min left</span>
          </div>
        </div>
        <div className="lg:col-span-6 lg:text-right">
          <span
            className="font-display text-7xl font-bold tabular-nums leading-none tracking-[-0.04em] text-brand sm:text-8xl lg:text-[6.75rem]"
            style={DISPLAY_OPSZ}
          >
            38:12
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-surface-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-row items-center gap-2 text-base">
          <Face initials="SA" />
          <span className="rounded-md rounded-bl-sm border border-surface-border bg-surface px-3 py-2">
            Library at 7? Stuck on Q3, need a push.
            <span className="ml-3 text-sm tabular-nums text-ink-subtle">11:04</span>
          </span>
        </span>
        <span className="text-base text-ink-muted">Chat opens for Ana at 12:10.</span>
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
 *
 * It comes straight after the desk, on the same ink, before a word of
 * explanation: large, but a size under the headline so the page has one
 * hero, one colour, balanced across the measure. It is a sentence — goals separated by commas,
 * each goal kept whole on its line — because a sentence is allowed to wrap
 * and a list of slashes is not. The last clause is the custom goal, and it is
 * the strongest line, not a trailing off.
 */
function WhoItIsFor() {
  const goals = GOALS.filter((goal) => goal.key !== 'custom');

  /** "Final exam" → "final exam"; "SAT" and "IELTS / TOEFL" keep their capitals. */
  const lower = (label: string) =>
    label
      .split(' ')
      .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
      .join(' ')
      .replaceAll(' / ', ' or ');

  return (
    <Section className="bg-ink pb-24 pt-16 text-white">
      <p className="text-xl leading-snug text-white/60">
        For anyone from {EDUCATION_LEVELS[0]!.label.toLowerCase()} to{' '}
        {EDUCATION_LEVELS[EDUCATION_LEVELS.length - 1]!.label.toLowerCase()}, working toward
      </p>
      <h2
        className="mt-6 text-3xl font-bold tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem]"
        // Responsive `text-*` utilities carry a line-height that outranks `leading-*`; set it here.
        style={{ ...DISPLAY_OPSZ, lineHeight: 1.04, textWrap: 'pretty' }}
      >
        {goals.map((goal, index) => (
          <span key={goal.key}>
            {/* A goal stays on one line where the measure allows it; a phone gets to wrap. */}
            <span className="sm:whitespace-nowrap">
              {index === 0 ? goal.label.replaceAll(' / ', ' or ') : lower(goal.label)}
              <span className="text-white/40">,</span>
            </span>{' '}
          </span>
        ))}
        <em className="text-white">or the thing only you are working toward.</em>
      </h2>
    </Section>
  );
}

/**
 * One Tuesday, as a log: five moments with their times, read down the left,
 * and on the right, on the hero's own column, what the desk shows after the
 * clock stops — the approval, the chat that opened, the day signed off — with
 * the same times in the same place, so the two columns read as one ledger.
 * Nothing the hero already showed is drawn again. Times are invented; every
 * count and point value is read from the shared constants.
 */
function Tuesday() {
  const moments = [
    {
      time: '10:31',
      title: 'Ana asks Priya.',
      body: `Same goal, same university, online now. Priya says yes in four minutes; a request nobody answers lapses at ${REQUEST_MINUTES}, so nobody is left waiting.`,
    },
    {
      time: '10:40',
      title: 'She starts the clock.',
      body: `Problem set 7, ninety minutes — a task runs from ${MIN_TASK_MINUTES} minutes to ${MAX_TASK_MINUTES / 60} hours. While it runs the group chat is closed to her and open to everyone else.`,
    },
    {
      time: '12:10',
      title: 'She marks it done.',
      body: 'With two lines of proof and a photo of the page. Sam gets a push, and the task waits for him.',
    },
    {
      time: '12:14',
      title: 'Sam approves it.',
      body: `Four stars out of ${MAX_RATING}, and a note. Nobody marks their own homework; a stranger who is doing the same reading does.`,
    },
    {
      time: '23:59',
      title: 'The day is signed off.',
      body: 'Every task approved, so the day earns its bonus. The streak is six; the next badge is at seven. Tomorrow it resets, at her midnight, not a server’s.',
    },
  ];

  return (
    <Section id="how" className="bg-surface pb-24 pt-24 text-ink sm:pt-40">
      <h2 className={`${H2} max-w-3xl`} style={DISPLAY_OPSZ}>
        One Tuesday, start to finish.
      </h2>
      <div className="mt-14 grid gap-14 lg:grid-cols-12 lg:gap-8">
        <ol className="flex flex-col lg:col-span-5">
          {moments.map((moment, index) => (
            <li
              key={moment.time}
              className="landing-reveal grid grid-cols-[4.5rem_1fr] gap-x-4 border-t border-surface-border py-6 first:border-t-0 first:pt-0"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="pt-0.5 font-display text-xl font-bold tabular-nums leading-none text-ink">
                {moment.time}
              </span>
              <div className="flex flex-col">
                <h3 className={H3}>{moment.title}</h3>
                <p className={`${BODY} mt-2 max-w-[52ch]`}>{moment.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div
          aria-hidden="true"
          className={`flex flex-col self-start bg-surface-muted px-6 py-5 text-ink sm:px-8 sm:py-6 lg:col-span-7 lg:col-start-6 ${BLEED_RIGHT}`}
        >
          <div className="flex flex-row items-center justify-between border-b border-surface-border pb-4">
            <span className="font-display text-lg font-bold">Ana&rsquo;s desk, after 12:10</span>
            <span className="text-sm text-ink-muted">Tuesday</span>
          </div>

          <div className="grid grid-cols-[4.5rem_1fr] gap-x-4 border-b border-surface-border py-5">
            <span className="font-display text-xl font-bold tabular-nums leading-none">12:14</span>
            <div className="flex flex-col gap-3">
              <div className="flex flex-row items-baseline justify-between gap-4">
                <span className="text-lg font-semibold">Problem set 7, Q1–Q4 · approved</span>
                <span className="font-display text-2xl font-bold tabular-nums leading-none text-brand">
                  +{4 * CREDITS_PER_RATING_POINT}
                </span>
              </div>
              <div className="flex flex-row items-center gap-3">
                <Face initials="SA" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-base">
                    <span className="font-semibold">Sam</span>
                    <span className="ml-3 tracking-[0.15em] text-ink">★★★★</span>
                    <span className="text-surface-border">★</span>
                  </span>
                  <span className="text-base text-ink-muted">“Q3 is right, show the working.”</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[4.5rem_1fr] gap-x-4 border-b border-surface-border py-5">
            <span className="font-display text-xl font-bold tabular-nums leading-none">12:10</span>
            <div className="flex flex-col gap-2">
              <span className="text-base text-ink-muted">Chat opened for Ana</span>
              {[
                { who: 'SA', text: 'Library at 7? Stuck on Q3, need a push.', at: '11:04' },
                { who: 'MK', text: 'Done at 6. I’ll check yours then.', at: '11:19' },
                { who: 'AN', text: 'Q3: it wants the general case first. On my way.', at: '12:11', me: true },
              ].map((line) => (
                <div key={line.at} className={`flex flex-row items-end gap-2 ${line.me ? 'flex-row-reverse' : ''}`}>
                  <Face initials={line.who} />
                  <span
                    className={`rounded-md px-3 py-2 text-base ${
                      line.me
                        ? 'rounded-br-sm bg-ink text-white'
                        : 'rounded-bl-sm border border-surface-border bg-surface'
                    }`}
                  >
                    {line.text}
                  </span>
                  <span className="text-sm tabular-nums text-ink-subtle">{line.at}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[4.5rem_1fr] gap-x-4 pt-5">
            <span className="font-display text-xl font-bold tabular-nums leading-none">23:59</span>
            <div className="flex flex-row items-baseline justify-between gap-4">
              <span className="text-lg font-semibold">Day signed off · every task approved</span>
              <span className="font-display text-2xl font-bold tabular-nums leading-none text-brand">
                +{DAILY_COMPLETION_BONUS}
              </span>
            </div>
            <span className="col-start-2 mt-1 text-base text-ink-muted">Streak 6 days · next badge at 7</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * The small decisions, said plainly. A landing page usually buries these, and
 * they are the ones that tell somebody whether the product was built by people
 * who had thought about the problem. Five principles, the full width of the
 * grid, each title at display size with its reasoning beside it: the one
 * section on the cream that is set like the wall. Numbered because people
 * quote them by number.
 */
function Rules() {
  const rules = [
    {
      title: 'A star is worth ten points, and a clean day twenty more.',
      body: 'Five stars, fifty. The bonus is for every task of the day signed off, not for volume: ten tiny tasks do not beat one real one.',
    },
    {
      title: 'A nudge at 8am, only if you need one.',
      body: 'Nothing planned when your day starts? Buddy says so once, then leaves you alone.',
    },
    {
      title: 'Nobody is punished for a silent reviewer.',
      body: 'An unchecked task closes itself after a full extra day. Your streak survives; it earns nothing, because nobody looked.',
    },
    {
      title: 'Walking away costs something, never everything.',
      body: `Abandoning a started task costs ${ABANDON_PENALTY} points, capped at what you have. Nobody goes into debt.`,
    },
    {
      title: 'A status says what is happening to the work, not how you feel.',
      body: `${STATUSES.length} of them, one tap each, and each tells your group what to do about it. The ${REACTIONS.length} reactions can only be kind; there is no thumbs down.`,
    },
  ];

  return (
    <Section id="rules" className="bg-surface pb-24 pt-16 text-ink">
      <div className="border-t border-ink pt-16">
        <h2 className={H2} style={DISPLAY_OPSZ}>
          The things we argued about
        </h2>
        <ol className="mt-12 flex flex-col">
          {rules.map((rule, index) => (
            <li
              key={rule.title}
              className="grid gap-4 border-t border-surface-border py-8 first:border-t-0 first:pt-0 lg:grid-cols-12 lg:gap-8"
            >
              <span
                className="font-display text-5xl font-bold tabular-nums leading-none text-ink lg:col-span-1"
                style={DISPLAY_OPSZ}
              >
                {index + 1}
              </span>
              <h3
                className="text-2xl font-bold leading-[1.15] tracking-tight sm:text-3xl lg:col-span-6"
                style={DISPLAY_OPSZ}
              >
                {rule.title}
              </h3>
              <p className={`${BODY} max-w-[44ch] lg:col-span-5 lg:col-start-8`}>{rule.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/** Questions and their answers, in the open, two to a row across the grid. */
function Questions() {
  const questions = [
    {
      q: 'What happens to the task I type at the top?',
      a: 'It goes on your desk the moment your account exists — a group of one, named after you — and you can start the clock on it from the last screen of signup. It earns points once someone you invite to the desk checks it; finished alone, it still counts toward your streak, and the app says so.',
    },
    {
      q: 'What if I don’t know anybody here?',
      a: `That is the case it is built for. Strangers are ranked by your goal, then your campus, then your subject, and a request lapses after ${REQUEST_MINUTES} minutes so you are never left waiting.`,
    },
    {
      q: 'Is it only for exams?',
      a: `No. ${GOALS.length - 1} goals, from a thesis to job hunting, fitness, a language or a reading habit, plus a box you fill in yourself.`,
    },
    {
      q: 'Do I have to install anything?',
      a: 'No. Buddy runs in this browser. Phone apps are being built; there is nothing to download yet.',
    },
    {
      q: 'Who can join?',
      a: `Anyone ${MIN_AGE_YEARS} or over. Signup asks your date of birth first, before anything else.`,
    },
  ];

  return (
    <Section id="questions" className="bg-surface pb-24 pt-16 text-ink sm:pb-40">
      <div className="border-t border-ink pt-16">
        <h2 className={H2} style={DISPLAY_OPSZ}>
          Reasonable questions
        </h2>
        <dl className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-2">
          {questions.map((item) => (
            <div key={item.q} className="flex flex-col">
              <dt className={H3}>{item.q}</dt>
              <dd className={`${BODY} mt-2 max-w-[50ch]`}>{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

/**
 * The question asked a second time, for the reader who has an answer now — as
 * one line of type with the form beside it, not the hero again. Ink, so the
 * footer runs on from it without a seam.
 */
function Closing() {
  return (
    <div className="bg-ink px-6 pb-12 pt-24 text-white">
      <div className={`${GRID} grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-8`}>
        <h2 className={`${H2} lg:col-span-5 lg:pb-8`} style={DISPLAY_OPSZ}>
          What will you finish today?
        </h2>
        <div className="flex max-w-lg flex-col lg:col-span-7">
          <TaskForm id="closing-task" placeholder="Chapter 4, first draft" />
          <p className="mt-3 text-sm text-white/70">Six short questions, then it is on your desk.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Two lines. Every link here resolves to a route that exists: there is no
 * /about, /pricing, /careers or /privacy in this app, and a footer of dead
 * links is worse than a short footer.
 *
 * "For now, the web app" is said here, once, rather than left for someone to
 * discover. There is an Expo client in the repo, and until it ships promising
 * it would be a lie with a download button on it.
 */
function Footer() {
  const links = [
    { href: START, label: 'Create an account' },
    { href: '/login', label: 'Sign in' },
    { href: '#how', label: 'How it works' },
    { href: '#rules', label: 'The rules' },
    { href: '#questions', label: 'Questions' },
  ];

  return (
    <footer className="bg-ink px-6 pb-10 pt-8 text-white">
      <div
        className={`${GRID} flex flex-col gap-4 border-t border-white/15 pt-6 text-sm sm:flex-row sm:items-baseline sm:justify-between`}
      >
        <span className="flex flex-col gap-1 text-white/60">
          <Wordmark className="text-white" />
          <span>Made for people who study alone and would rather not.</span>
        </span>
        <nav aria-label="Footer" className="flex flex-row flex-wrap gap-x-6 gap-y-2">
          {links.map((link) =>
            link.href.startsWith('#') ? (
              <a key={link.href} href={link.href} className="text-white/60 hover:text-white">
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className="text-white/60 hover:text-white">
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
