# Buddy — Product v3: the session is the spine

> Status: **PROPOSAL, 2026-09-04.** Written against the build as it stands
> (ARCHITECTURE.md §2, migrations 0000–0010). Nothing here is implemented.
> Every proposal carries a cost tag using ARCHITECTURE.md's own vocabulary:
> **web-only** · **needs `apps/api`** · **needs migration** · **needs a
> provider** (payments, video, identity). Where a proposal reverses a recorded
> decision, it says which one and why the reasoning no longer holds.

---

## 0. The one-paragraph version

Buddy today is a *review* product: write tasks due today, mark them done, have
a buddy rate them. What the brief describes — a timer for the group, someone
checking on you, a nudge when you have not started, chat that opens when the
work is finished — is a *session* product. The build already has the atom of
that: a task carries the time its owner says it needs (1.5 hours), the owner
hits Start when they choose, and a countdown runs. What it lacks is everything
around that clock. Nobody but the owner can see that a task has *not* been
started; there is no moment at which "not started yet" becomes a problem the
product can point at; one person's clock cannot be shared with a group; and a
nudge or a "check on me" has nothing to attach to. The redesign keeps the
owner's Start button exactly as it is and adds one object around it, the
**Session** — a running clock, made visible, with participants, and the tasks
each brought — and moves the focus lock, nudges, check-ins, chat and the streak
onto it. A solo session *is* today's task clock. A group session is the same
clock shared. Tasks
and reviews stay; they become what a session contains and how it ends. Around
that spine this document fixes the incentive loopholes in the current credit
system, adds the trust controls a stranger-matching product for 16-year-olds
cannot ship without, and gives the community layer (feed, campus, reflection)
a reason to exist beyond photos.

---

## 1. Audit of the current build

Read the build as a first-time user would, then as someone trying to game it.

### 1.1 Five structural gaps

| # | Gap | Where it shows | Why it matters |
|---|---|---|---|
| G1 | **Not starting is invisible.** A task has an estimate and the owner presses Start; until then it is simply `planned`, and `planned` looks the same at 9am as at 11pm. | Groupmates cannot see "Sara's 1.5-hour task still has not been started." Nothing derives the one fact that makes it urgent: with 1.5 hours to go and local midnight at 00:00, the task cannot be finished if it is not started by 22:30. The 8am nudge (`jobs/nudge.ts`) fires only for people with *nothing planned*. | The whole brief — peer pressure, nudges, check-ins — hangs off "you have not started yet, and it is getting late." |
| G2 | **The clock is private.** One task, one owner, one countdown. | Groupmates see a "running" state; they do not share it. There is no group session, no "3 of 5 working now", no synchronised break. | Body doubling is the single best-evidenced mechanism in this category (Focusmate, Flown, Caveday; §5.1), and it needs a shared clock. |
| G3 | **Peer pressure has one channel and it is after the fact.** Review with a 0–5 rating. | Nobody can nudge, ask to be checked on, or say "I'm starting, watch me." `STATUSES` (`need_a_push`) hints at it but only changes a label. | The product's stated purpose is *starting*, and every mechanism it has is about *finishing*. |
| G4 | **No trust primitives.** Reports exist; block and mute do not (`grep` finds none). Institution is free text and unverified. Feed is global and photo-first. | A matched stranger can message anyone in a shared group forever; a 16-year-old's photo is visible to every account on the platform. | A stranger-matching product for minors-adjacent users without block is a launch blocker, not a nice-to-have. |
| G5 | **The community layer has no purpose of its own.** Feed = photo + reaction. Leaderboard = global credits. Groups = a chat around a task list with no end date. | Nothing connects an approved task to the feed; nothing lets a student find "everyone doing CS2040 finals this week"; a group never finishes. | The brief asks for a community "riding the journey together" — that needs cohorts, milestones and endings. |

### 1.2 Loopholes in the incentive system, as built

The user asked for loopholes. Every row is reproducible today.

| Loophole | How | Fix (detail in §3.6) |
|---|---|---|
| **Mutual 5-stars.** In a 2-person group, both members approve each other at 5 every day. | Nothing checks reciprocity; credits = `rating × 10`. | Rating no longer drives credits. Credits come from *verified session minutes*; ratings become private feedback for reliability, not currency. |
| **Micro-task farming.** Ten 5-minute tasks earn ten approvals, ten chances at rating 5, and the +20 daily bonus. One 4-hour task earns one. | Credits are per task, not per minute. | Credits per session-minute actually clocked, capped per day. |
| **The solo desk earns the streak.** A group of one, task marked done, rollover approves at 0 after a day (`closeUnreviewed`). | Streak = consecutive days with an approved task, regardless of whether anyone looked. | Streak counts *sessions attended*, not approvals. A solo session still counts (Forest's model), but only if the clock ran. |
| **Rating 0 approves.** Decided 2026-08-27 to avoid a stuck state. | A reviewer who thinks the work was not done has no way to say so that has any effect. | Keep "0 approves" for closure, add a separate **"didn't happen" flag** that feeds the reliability score without blocking closure. |
| **First-review sniping.** In 3+ groups with no Buddy named, any member's review is final. | A friend approves before an honest member can request proof. | Named verifier per session (already half-built as `verifierUserId`), else *random* member assignment at session end, with a 10-minute window before it widens. |
| **Proof is optional and never required.** | `markTaskDoneSchema` accepts empty proof. | Proof required when session minutes ≥ 45 or estimated ≥ 60; a photo, a file, or a 2-line "what changed". |
| **Abandon penalty is trivially dodged.** Abandon costs 10 credits, but letting the day roll over clears the clock free (`rollover.ts`: "no penalty is charged"). | Start at 11:55pm, walk away. | Session no-show and early-leave counted in the reliability score, never in credits. Credits should never be a punishment currency (§5.2). |
| **The leaderboard is global and volume-based.** | A new account is 4,312th; a PhD student and a 16-year-old compete on the same board. | Leagues of ~30 by level and activity, weekly, promotion/relegation (already recorded in ARCHITECTURE.md §2.9 as "the most likely single change to move retention"). |
| **Rest day breaks the streak.** `day_off` status exists, but `resetLapsedStreaks` does not read it. | Set "Taking today off", lose a 30-day streak. | Planned rest days (declared before the day starts, max 2/week) and 2 streak freezes/month honoured by rollover. |
| **Buddy request expiry punishes the recipient's absence.** 5-minute window, one pending request at a time. | At 2am in a small user base, nobody is reachable; the requester bounces off five people and leaves. | Keep the instant request for active-now users; add **scheduled matching** ("find me a partner for 8pm") which is what Focusmate actually does. |

### 1.3 Things the current build gets right and should not be touched

- Questions before the account, first task before the password (§2.9).
- Verbs, not moods, in `STATUSES` — each carries what it asks of others.
- Positive-only reactions. No dislike surface.
- Focus lock enforced by reading truth, not state.
- The desk of one is honest about what it is missing.
- Reports manual, not threshold-based.

---

## 2. Who this is for, sharpened

**Primary:** students 16–26, school through PhD, who *know what to do and cannot
start.* Not the disorganised (they need a planner) and not the already
disciplined (they need nothing). The middle: people whose problem is
activation energy, and for whom the presence of one other person changes
whether the thing happens.

**Three personas the design is checked against:**

1. **Sara, 17, A-levels.** Studies alone at home, phone is the enemy, parents
   nag. Wants someone her age doing the same thing at the same time. Cannot use
   video. Safety-critical.
2. **Deniz, 21, undergrad, group project.** Four people, one deadline, two who
   never show. Wants visibility of who did what without being the one who
   nags.
3. **Mai, 27, PhD.** Unstructured weeks, no external deadlines for months.
   Wants a 9am co-writing session every weekday with the same two people and a
   record that she wrote.

Every mechanism below has to work for all three. Where it does not, it says
so.

---

## 3. The core loop, redesigned

```
  PLAN            COMMIT              SESSION               CHECK              REFLECT
  what, today  →  when, how long,  →  clock runs, presence, →  verify, rate,   →  debrief, post,
  (exists)        who watches         nudges, focus lock       reliability        weekly retro
                  (new: Session)      (new: shared)            (fixed)            (new)
```

### 3.1 The Session

**Definition.** A Session is a clock with people around it: `started_at`
(set when the host presses Start, exactly as a task's clock is today),
`planned_minutes` (for a solo session, the task's own estimate; for a group
session, 25/50/90 or custom 5–240), `mode` (see below), `group_id` (nullable —
a solo session belongs to the desk), `host`, `participants` with per-person
`state` (invited · committed · present · late · no_show · left_early ·
completed), and the tasks each participant brought. `scheduled_for` is
optional and exists only for group sessions people agree on in advance.

**The owner's Start button does not change.** Pressing Start on a task with a
1.5-hour estimate creates a solo session of 90 minutes and starts its clock.
That is the whole of the solo mode, and it is what the build does today under
a different name. Everything below is what becomes possible once that clock is
an object the group can see.

**The latest start.** Because a task carries the time it needs and the day
ends at local midnight, the product can derive the one number the brief's
nudges need without asking anyone to schedule anything: `latest_start =
midnight − estimate`. A 1.5-hour task on a day that ends at 00:00 must be
started by 22:30. This is shown on the task ("start by 22:30"), it is what
turns *not started* from a state into a countdown, and it is the trigger for
the system nudge in §3.3. The owner can override it with an earlier "start by"
of their own; they cannot push it later than the arithmetic allows.

**Modes.**

| Mode | What it is | Who it is for |
|---|---|---|
| **Solo** | Your own clock, on your desk. Counts for streak. Nobody watches unless you ask (§3.3). | Everyone, day one. |
| **Group** | One clock for the group, host starts it, everyone's presence is visible. Chat locked during, opens after. | Deniz's project group, Mai's writing trio. |
| **Pomodoro** | Group mode with built-in breaks (25/5 or 50/10). Chat opens *during breaks* — this is the "daily moment" from §2.9 done in a way that does not fight the focus lock, because the break is part of the session. | Long evening study blocks. |
| **Campus room** | A recurring, open group session tied to a campus or a subject ("CS2040 finals, 7–9pm"). Anyone at the institution can drop in. Host is the system. | Sara finding "someone my age doing this now". Cold-start fix. |
| **Matched** | Two strangers, matched at a scheduled time, 50 minutes, video optional (§6.3). Focusmate's model. | Users with no group and no friends yet. |

**Group sessions** start now ("Start a 50", everyone in the group is invited
to join the running clock) or are agreed in advance ("7pm tonight"), which is
the only place a scheduled time appears in the product. An agreed session
sends a commitment confirmation, a 10-minute reminder, and a start ping.
Participants *commit* (one tap), which is the social contract the group
nudges enforce.

**Recurring sessions** ("every weekday 9am") are the retention engine for Mai
and the structure Sara's parents cannot provide. One row per recurrence rule,
materialised 7 days ahead by the cron.

**Reversal of a recorded decision.** ARCHITECTURE.md §2.9 rejected a BeReal
"daily moment" because it fights the timezone rule and the focus lock. A
Session is set by the group at an explicit instant, so timezones are the
group's problem to solve once when scheduling (the UI shows each member's local
time), and the focus lock *is* the session, not something the moment fights.

**Cost:** needs `apps/api` + migration (`sessions`, `session_participants`,
`session_rules`), a Durable Object per live session for presence, and a cron
to materialise recurrences and fire reminders.

### 3.2 Tasks inside sessions

A task stays what it is (`title`, `estimated_minutes`, `due_date`). Two
additions:

- `session_id` (nullable). Bringing a task to a session is how "I will do X at
  7pm" is expressed. A task can be brought to several sessions over its life;
  the join table records minutes clocked against it per session.
- **Actual minutes** accumulate from sessions. Estimate vs. actual becomes
  visible to the owner over weeks — the single most useful self-knowledge a
  student gets, and the input to "you are over-committing today" (§5.3).

"What will you do in this session?" is asked at commit time with the day's
planned tasks as chips. A session with no task is allowed (Mai: "writing") but
the debrief asks what got done.

### 3.3 Starting, presence, and nudges

This is the brief's centre and the current build's emptiest area.

**Detecting "did not start", solo.** A task is *not started* until its owner
presses Start. From the moment `latest_start` (§3.1) is less than 30 minutes
away, that state is shown to the group as **running out of time** ("Sara ·
Chapter 4 · 1.5h · start by 22:30") rather than as a neutral planned row. When
`latest_start` passes without a Start, it becomes **won't fit today**. Neither
touches credits; a task that was never started is what the day's *missed*
already records. This is the trigger the brief asked for, and it needs nothing
from the owner beyond the estimate they already give.

**Detecting "did not start", group.** A committed participant whose group
session started and who has no `present` heartbeat within 5 minutes is
`late`. At 10 minutes, `no_show`. Both are Focusmate's thresholds and both
feed reliability (§3.6), never credits.

**Presence** is a heartbeat over the session's Durable Object socket, with the
app foregrounded or the web tab visible. The group screen during a session
shows each member as: working (green dot, minutes elapsed) · on break · late ·
absent. This is YPT's "who is studying right now" and it is the peer pressure.

**Three kinds of nudge, deliberately different.**

| Nudge | Trigger | Who sends | Content | Limits |
|---|---|---|---|---|
| **System nudge** | Solo: `latest_start` is 30 minutes away and the task is not started. Group: session started, participant not present. | The app | Solo: "Chapter 4 needs 1.5h — start by 22:30 to finish today." Group: "Your 7pm with Deniz and Ali started. Tap to join." One more at +5. | One per task per day; two per group session. Never after `no_show`. |
| **Buddy nudge** | A groupmate taps a not-started task on the group board, or a late member's avatar during a group session | A person | Pre-written, chosen from 4: "Waiting for you" · "You've got this" · "Starting without you — come when you can" · "Everything ok?" No free text — free text is where nagging lives. | One per task per day, one per member per session. Recipient sees who sent it. |
| **Requested check-in** | Owner asks a specific buddy, on the task or before a session: "Check on me at 7:15" | A person, at the owner's request | The buddy gets a push at the time; a one-tap reply lands in the owner's session view: 👀 "Checking — how's it going?" Owner answers with a status verb. | Owner-initiated only. This is the "ask a buddy to check on them" from the brief, and it is opt-in by construction. |

**Quiet hours and a nudge budget** (§5.3) bound all three. Nudges are never
sent 23:00–07:00 local unless the recipient scheduled the session inside that
window.

**Phone-down is visible, not punished.** Backgrounding the app or hiding the tab
during a session flips the person's presence to *distracted* for the group to
see, with no penalty. YPT blocks apps and Forest kills a tree; Buddy shows the
group, which is the mechanism the product is built on.

**Late join is always allowed.** A session never locks someone out for being
late; the reliability score records it and the person still gets the minutes.
Locking people out converts lateness into absence.

**Cost:** needs `apps/api` (session DO with heartbeat, three push types,
per-session nudge ledger), web + mobile UI. The buddy-nudge phrases are data in
`packages/shared`, like `STATUSES`.

### 3.4 Chat, sequenced around the session

The existing focus lock generalises:

- **During a session:** chat is locked for present participants. A single
  **status line** per person (the `STATUSES` verbs) is the only channel, plus
  the check-in reply above.
- **During a break** (pomodoro mode): chat open for the break's length. The
  composer shows the countdown to the next block.
- **After the session:** the chat opens with a system-posted **debrief card**:
  who was present, minutes each, tasks each brought and marked done. Members
  react or reply. This is the "chat they can use when their task is finished"
  from the brief — and the card is what makes the chat about the work rather
  than about anything.
- **Outside sessions:** chat is open, as today.

A member not in the session is not locked; they see the session banner and can
join it.

### 3.5 Verification, rewritten

Today a review is *rating 0–5 or request proof*, first review wins. Replace
with:

1. **Session end → self-report.** Each participant marks each brought task:
   done · partly · not done, with optional proof (text/photo/file). Honesty is
   cheap here because credits do not depend on it (§3.6).
2. **Verification assignment.** If the session or group has a named verifier
   (`verifierUserId` exists), it is them. Otherwise one present member is
   assigned at random, told, and given a 10-minute window; then it widens to
   anyone. Random assignment kills first-review sniping.
3. **Verifier actions:** *confirm* · *ask for proof* · *didn't happen*. A rating
   1–5 is optional and private — shown to the owner as feedback, aggregated
   into nothing public. "Didn't happen" closes the task as `disputed`, does not
   touch credits (there are none from ratings), and feeds both people's
   reliability history (a pattern of disputes on one side or the other becomes
   visible in the group's health view, §4.3).
4. **Unreviewed after 24h** closes as `unverified`, as today, and counts for
   streak because the *session* already did.
5. **Proof required** when estimated ≥ 60 min or session minutes ≥ 45; the
   verifier cannot confirm without it.

**Cost:** needs `apps/api` + migration (task statuses gain `partly`,
`disputed`, `unverified`; `task_reviews.action` gains `didnt_happen`;
`session_task_reports`). The mobile app has no session UI, so the review
change binds only where sessions exist.

### 3.6 Credits, reliability, streaks, leagues

Three separate numbers, because today's one number is asked to do three jobs
and does all of them badly.

**Credits = effort.** `1 credit per verified session minute`, cap 240/day.
Solo minutes count at 0.5 (nobody saw them; Forest's logic). A verifier's
confirmation is what makes a minute "verified"; unverified minutes count at
0.5. Bonuses: +20 for a session where every participant completed
(cooperative, not competitive — Duolingo's Friend Quest), +10 for a recurring
session's fourth consecutive occurrence. **No penalties, ever.** Credits are
never taken away; that is what reliability is for. The `ABANDON_PENALTY` goes.

**Reliability = keeping your word.** Focusmate's attendance score, verbatim:
percentage of the last 20 committed sessions attended on time. Shown on the
buddy card and profile as *Shows up: 95%*. Below 70%: instant matching is
suspended and the person is told why; scheduled sessions with existing groups
continue. Recovers by attending. This is the healthy version of pressure: it
is visible, it is about the promise not the work, and it heals.

**Streak = days with a session attended** (any mode, ≥ 25 minutes). Not
approvals. Forgiveness built in:

- **Planned rest days**: declared before the day starts, max 2/week, streak
  holds. `day_off` status becomes this and `rollover.ts` reads it.
- **Streak freeze**: 2/month, auto-applied to the first missed day, replenished
  on the 1st. Earned extras at 30/100-day milestones (Duolingo's Streak
  Society).
- **Repair**: a lapsed streak of ≥ 14 days can be restored once by attending
  3 sessions in the next 3 days. Loss aversion without cruelty.
- **Group streak** (Friend Streak): days on which every member of a group
  attended something. Shown on the group header. Breaks only when everyone
  misses.

**Leagues replace the global board.** Weekly, ~30 people, bucketed by
education level and last-week credits; top 7 promote, bottom 7 relegate. The
global all-time board stays as a page nobody is sent to. Per-group standings
stay as-is. A user can opt out of leagues entirely (§5.3).

**Badges** shift from credit thresholds to behaviours worth having: *Showed
up 20 times*, *Verified 50 sessions*, *Kept a 9am for a month*, *Brought a
stranger to their first session*, *Never missed a group session in finals
week*.

**Cost:** needs `apps/api` + migration (`credit_ledger.reason` widens;
`user_stats` gains `reliability_*`, `rest_days`, `freezes`; `leagues`,
`league_members`; weekly job). Badge definitions are data.

---

## 4. Community: the journey together

### 4.1 Finding people — three doors instead of one

| Door | For | Mechanism |
|---|---|---|
| **Now** (exists) | Someone active this minute | Today's directory + 5-minute request. Keep, but only show people active in the last 15 min under "Now", so the 5-minute window is not sent to sleepers. |
| **Scheduled match** (new) | "I want a partner at 8pm tonight" | Pick a slot (15-minute grid, next 7 days) and a length. Matched at T-15 by: same slot → same level → same institution → same goal → same subject. If unmatched at T-15, offered the nearest campus room or a solo session with a check-in from a past buddy. This is Focusmate's model and the only mechanism that works in a small population. |
| **Campus & subject rooms** (new) | "Anyone at my uni doing this right now?" | Recurring open sessions per verified institution and per subject bucket, materialised by cron for the two busiest evening slots in each timezone with ≥ 20 verified users. Below the floor, a subject room spans institutions. Presence counts on the landing page ("41 people at UCL working now") come from these — the social-proof line §2.9 wanted, made honest. |

**Compatibility beyond profile fields.** Two additions to matching that the
current lexicographic score lacks: *schedule overlap* (from declared weekly
availability, a 7×3 grid: morning/afternoon/evening) and *reliability band*.
A 95% person should not be matched with a 40% person on their first session.

**The request composer suggests the opening line** from shared terms (Hinge
prompts, already in §2.9's backlog) — web-only, do it.

### 4.2 Groups with a shape

Today a group is a name and an emoji. Give it:

- **Purpose and end date** ("Thermodynamics final · ends 14 Dec"). Groups
  with an end date get a countdown, a final-week mode (daily sessions
  suggested), and a **closing card** on the day after: total sessions, minutes,
  who showed up most. Then it archives, and the members are offered to "keep
  going as a new group" — Strava's club season model. Deniz's project group
  ends when the project does; this is *why* it existed.
- **Schedule.** The group's recurring sessions, visible on the group screen
  and in each member's Week view.
- **Group kinds** the product actually sees in the wild: *study*, *project*,
  *habit* (gym, reading — the brief's "workout"), *side hustle*, *thesis*.
  Kind changes defaults: a habit group defaults to 30-minute daily sessions
  with photo proof; a project group defaults to a shared task list where tasks
  can be *assigned* to a member (the brief's "setting tasks for each person") and
  a member can *claim* an unassigned task.
- **Roles:** host (creates sessions, sets the schedule), verifier (§3.5),
  member. Host is transferable; a host inactive 14 days auto-transfers to the
  most reliable member.
- **Group health** (§4.3) and a **remove member** action for the host with a
  cooling reason list — today the only exit is leaving.

**Cost:** needs `apps/api` + migration (`groups` gains `kind`, `purpose`,
`ends_on`, `archived_at`; `tasks` gains `assigned_by`; `group_members.role`
gains `verifier`).

### 4.3 Group health, and what happens when a group dies

Most groups die quietly. The product should notice first:

- A group with no session in 7 days gets one prompt to the host: "Schedule
  one, or archive it?" Not more than one.
- A member absent from 5 consecutive group sessions is shown to the host as
  *drifting* with a one-tap "check on them" (the §3.3 requested check-in, but
  host-initiated for this one case).
- A matched 2-person group where one side no-shows twice: the other side is
  offered a rematch and the no-show's reliability drops. Nobody is stuck with a
  ghost.

### 4.4 The Feed becomes the journey

Replace "photo + caption" as the feed's primary unit with three post types,
all generated from things that happened:

1. **Session card** (auto-offered after a session): "50 min · Thermodynamics
   · with Ali and Deniz · 3 of 3 tasks done." One tap to post, optional
   caption. Strava's activity-is-the-post. Cannot be faked: it is the debrief.
2. **Milestone card**: streak milestones, group closing cards, league
   promotions, "first session with a stranger."
3. **Experience post** (the brief's "share their experience"): a written post
   with a required *prompt* ("What finally got me started on my thesis was…",
   "The mistake I made in week one of finals…"). Prompts keep it about the
   journey rather than a general social feed; a rotating list in
   `packages/shared`.

Free photos stay allowed but stop being the default composer. Feed scope:
**campus → subject → everyone**, with a segmented control; a new account with a
verified institution opens on campus and never sees an empty screen (campus
rooms guarantee content). Reactions stay positive-only; replies stay short.

**Ask for help** is a fourth type, scoped to subject: "Stuck on §3 of the
problem set — anyone free for 25 minutes?" It creates a session on tap. This
is the *only* place strangers can message each other outside a group, and it
is always about starting a session together.

### 4.5 Reflection

- **Session debrief** (§3.4): 30 seconds, two questions: "What got done?" and
  one word from a fixed list about the session (*flow · fine · struggled ·
  distracted*). The word is private and feeds the weekly retro.
- **Weekly retro**, Sunday evening local: minutes by subject, estimate vs.
  actual, best session, people you worked with, one sentence to your future
  self. Shareable as a card; the sentence is shown back next Sunday.
- **Semester view**: sessions as a GitHub-style contribution grid, per
  group, since the group started. Mai's record that she wrote.

---

## 5. Motivation, and keeping the pressure healthy

### 5.1 What the evidence supports

- **Body doubling and declared intent** are the mechanisms with the best
  support for the activation problem: Focusmate reports >99% match rates and
  builds its whole product on a 5-minute no-show threshold and a 20-session
  attendance score; Caveday and Flown run structured 50–52-minute sprints with
  breaks; a survey cited by Flow Club found 85% of neurodivergent participants
  reported body doubling significantly helped task completion.
- **Streaks with forgiveness**: Duolingo reports users with 7+ day streaks
  retain at 2.4× and distributes freezes through several paths precisely so the
  streak stays positive rather than a source of dread.
- **Written goals + weekly progress reports to a peer** roughly doubled goal
  attainment in Matthews (2007), the one properly sourced figure in the
  accountability literature; the widely quoted "95% with an accountability
  appointment" has no verifiable source and should not appear in the product's
  copy.
- **Live group study with presence** is proven at scale by YPT (5M users,
  subject timers, groups showing who is studying now, category rankings).

Sources are listed at the end.

### 5.2 Design principles that follow

1. **Pressure attaches to promises, not to work.** Reliability tracks
   attendance; nothing tracks how *good* the work was in public. A student
   who shows up and struggles is the product's best user.
2. **Credits never go down.** Punishment currencies breed avoidance
   (`ABANDON_PENALTY` today makes people not start at all). Loss aversion is
   handled by streaks, which are forgiving by design.
3. **Nudges are scarce, templated, and traceable.** One buddy nudge per
   person per session, from a fixed list, with the sender's name. Nagging
   needs free text and volume; remove both.
4. **The person being pressured chose it.** Every check-in is requested by
   the recipient; every session is committed to by tapping; leagues are
   opt-out.
5. **Show the group, not the ranking, during work.** Presence during a
   session; rankings only weekly. YPT's live rank next to the timer is the one
   thing *not* borrowed.

### 5.3 Guardrails

| Risk | Guardrail | Cost |
|---|---|---|
| Over-commitment | If planned minutes today exceed (waking hours − declared classes/work) or exceed 8h, the plan screen says so and suggests cutting. Estimate-vs-actual history makes the number credible. | web-only, then mobile |
| Burnout | 7 days of ≥ 6h sessions triggers one message suggesting a rest day and offering to schedule it. Never repeated within 14 days. | needs `apps/api` |
| Nudge fatigue | Per-recipient budget: max 3 buddy nudges + 2 check-ins per day across all groups. Quiet hours 23:00–07:00 local. A recipient can mute nudges per group. | needs `apps/api` |
| Comparison anxiety | Leagues opt-out; credits hideable on profile; the Feed never shows minutes of people you are not grouped with unless they posted. | needs `apps/api` |
| Shame spirals | Reliability shown as a band (*reliable* ≥ 85 · *mostly* 70–84 · *rebuilding* < 70), the exact number only to its owner. Recovery path stated in the same place. | web-only |
| Late-night use | Sessions scheduled past 01:00 local get a "you sure?" and never send system pings. | web-only |
| Crisis signals | Status verb `need_a_push` three days running, or free text in debrief matching a distress list, surfaces local help resources once, privately, and never to the group. Not a moderation system. | needs `apps/api` |

---

## 6. Trust and safety

This section is a launch gate. Everything in §3–4 makes the product more
social with strangers and with minors, and none of it should ship before this.

### 6.1 Block, mute, and leaving cleanly

- **Block** (missing today): mutual invisibility in directory, feed, campus
  rooms and matching; existing shared groups show the blocked person's
  messages collapsed; a block from either side of a 2-person group archives
  it. Table `user_blocks`, checked in every people-listing query.
- **Mute**: per group, per person, nudges and chat push only.
- **Leave with a reason** (optional, private): the reasons feed group health
  and matching, not the leaver's profile.
- **Cost:** needs `apps/api` + migration; block is the first migration in the
  roadmap.

### 6.2 Institution verification

Free-text institutions are a matching signal today and become an *access*
signal with campus rooms. Verification: an email at a domain on the
institution's list → verified badge, campus feed and campus rooms unlocked.
Unverified users keep everything else. The list starts as a
`packages/shared` map of domains seeded from the first 50 institutions that
sign up; unknown domains are queued for an admin. No third-party identity
provider.

### 6.3 Minors and strangers

- Under-18 accounts: no matched sessions with over-18 strangers; matching
  pools split at 18. Campus rooms at schools are per-school only.
- **No video in v1.** Focusmate's model needs it; Buddy's does not: presence
  is a heartbeat, proof is a photo of the work. Video with strangers and
  minors is a provider, a moderation team and a policy the product does not
  have. Recorded so it is not re-proposed as a small feature.
- Photo proof stays group-private (as built). Feed photos from under-18
  accounts are campus-scoped only, never global.
- Age is self-declared and unverified (as built, §2.8); the split above is a
  floor, not assurance.

### 6.4 Moderation

- Keep manual reports. Add **Workers AI text screening** on chat and posts
  (Llama Guard, already parked as "phase 2") that *flags*, never hides.
- A photo-proof report auto-hides the image from the group pending review
  (the reporter has already seen it; the rest need not). Text is never
  auto-hidden.
- Admin gets a queue with the reporter's group context, not just the item.

### 6.5 Privacy

- Presence is visible only to session participants and group members.
- Location is never collected; "campus" is the verified institution.
- Data export and deletion: deletion is soft today and leaves messages; add
  an export (JSON of tasks, sessions, posts) for the stores' data-portability
  expectations.

---

## 7. Growth

- **Campus-first launch.** One institution at a time, timed to its exam
  period, with campus rooms pre-scheduled and a "N at [institution] working
  now" landing page. Nothing else in this document works in an empty
  population, and campus is the smallest population that can be dense.
- **The session card is the invitation.** Every debrief card shared outside
  the app carries a join link to the group's next session, not to the app.
- **Exam calendar.** Institutions publish exam timetables; import the top 50
  as data and pre-create subject rooms for the week before each exam.
- **Group invite link as the empty state** of a solo desk (already in §2.9's
  backlog; do it).
- **Referral = bring one person to one session.** The badge, not money.

---

## 8. Monetization: a position

Free: everything in §3–4 for one recurring session and up to two groups.
**Buddy Plus** (~€4/month, student-priced): unlimited recurring sessions and
groups, semester view and export, streak freezes above the free two, custom
session lengths, and league cosmetics. Institutions: a **campus plan** sold to
student-services departments (verified rooms, an admin dashboard of aggregate
activity, no individual data).

**Stakes (StickK-style pots): no.** The evidence for anti-charity stakes is
real (a 2024 trial reported +34% completion), but a money-loss mechanism on a
16+ product built on "credits never go down" (§5.2) contradicts its own
principle and hands the store review teams a gambling-adjacent question.
Recorded so it is not re-proposed.

The paywall never sits between a session and its start. Ever.

---

## 9. Metrics that tell the truth

| Question | Metric | Target at 90 days post-launch on a campus |
|---|---|---|
| Does the product cause work? | Verified session minutes per weekly-active user | ≥ 150/week |
| Does the pressure work? | % of committed sessions attended on time | ≥ 80% |
| Do people come back? | D7 / D30 retention of users who attended ≥ 1 group session in week 1 | 50% / 30% |
| Does the community layer matter? | % of sessions with ≥ 2 participants | ≥ 60% |
| Is the pressure healthy? | Nudge mute rate; leave-with-reason "too much pressure" share | < 5%; < 10% |
| Is matching alive? | Scheduled-match fill rate at T-15 | ≥ 90% (Focusmate: 99%) |
| Safety | Reports per 1k sessions; median admin resolution time | tracked, < 24h |

Guard metric: **estimate accuracy** trending toward 1.0 over 8 weeks. If it
does not, the debrief is being gamed or ignored.

---

## 10. Roadmap

Ordered so each slice is shippable and each earns the next.

| Slice | Contents | Cost | Why this order |
|---|---|---|---|
| **0. Safety floor** | Block/mute, under-18 matching split, leave-with-reason, nudge quiet hours (for the existing 8am nudge too). | `apps/api` + migration 0011 | Everything after this adds stranger contact. |
| **1. The Session, solo and group** | `sessions` + participants, start now / schedule, group clock with presence DO, focus lock moved to session, debrief card in chat, streak = sessions attended, planned rest days, freezes. Credits = minutes. `ABANDON_PENALTY` removed. | `apps/api` + migration 0012; web; mobile behind a flag | The spine. Nothing in the brief exists until this does. |
| **2. Pressure** | System start ping, buddy nudge (templated), requested check-in, reliability score, no-show handling, nudge budget. | `apps/api` + migration 0013; web | The brief's core, and needs sessions to hang on. |
| **3. Verification v2** | Self-report, random verifier assignment, "didn't happen", proof thresholds, private ratings. | `apps/api` + migration 0014 | Closes the loophole table. |
| **4. Finding people v2** | Scheduled matching, availability grid in profile, reliability in matching, request-line suggestions. | `apps/api` + migration 0015; web | Needs reliability from slice 2. |
| **5. Groups with a shape** | Kind, purpose, end date, closing card, assignment, host/verifier roles, group health, drifting members. | `apps/api` + migration 0016; web | Needs sessions to define health. |
| **6. Community** | Institution verification, campus and subject rooms, feed post types (session/milestone/experience/ask), campus scope, weekly retro. | `apps/api` + migration 0017; web | Needs a population; campus-first launch happens here. |
| **7. Leagues and badges v2** | Weekly cohorts, promotion/relegation, behavioural badges, opt-out. | `apps/api` + migration 0018 | Last, because it needs ~100 active users per level to be anything but a coin flip. |
| **8. Plus and campus plan** | Payments, entitlements, admin dashboard. | provider | After retention is real. |

**First slice, concretely (0 + the solo half of 1):** `user_blocks`, quiet
hours, `sessions` for the desk, "Start a 50" on the group screen, streak from
sessions, rest days. About two weeks of work, and it changes what the product
*is* on day one without needing a second user online.

**Mobile.** `apps/mobile` lags web and is out of scope for the working
agreement. The session model should be designed so mobile is a client of it
from the start (presence heartbeat is trivially mobile; it is *better* on
mobile because backgrounding is detectable). Every shared change stays additive.

---

## 11. Decisions for you

1. **Credits from minutes, not ratings.** This is the biggest reversal of the
   2026-08-27 decisions. Confirm.
2. **Session lengths:** 25/50/90 + custom, or the Focusmate 25/50/75 set?
   Proposed: 25/50/90 (90 matches a university lecture block).
3. **Reliability threshold** for suspending instant matching: 70%? And do
   you show the number or the band on the buddy card?
4. **Campus rooms below the 20-verified floor** collapse to subject rooms
   across institutions. Acceptable, or campus-only always?
5. **Video: none in v1.** Confirm, because the matched mode is weaker
   without it and Focusmate users expect it.
6. **Under-18 split at 18** for matching — or keep one pool and rely on
   institution scope? Proposed: split.
7. **Stakes: no.** Confirm so it can stop being re-raised.
8. **Which campus first,** and when is its next exam period? Slice 6 is
   built around a date.

---

## Appendix A — Data model delta

```
sessions               id, group_id (null = solo desk), host_id, kind (solo|group|pomodoro|campus|matched),
                       scheduled_for (null unless agreed in advance), started_at, planned_minutes,
                       break_minutes, rule_id (null unless recurring),
                       started_at, ended_at, state (scheduled|live|ended|cancelled), created_at
session_participants   session_id, user_id, state (invited|committed|present|late|no_show|left_early|completed),
                       joined_at, left_at, present_minutes, checkin_by (user_id|null), checkin_at
session_rules          id, group_id, host_id, kind, weekdays (bitmask), local_time, tz, planned_minutes,
                       break_minutes, active, created_at
session_tasks          session_id, task_id, self_report (done|partly|not_done|null), minutes
session_nudges         id, session_id, from_user_id, to_user_id, kind (start_ping|buddy|checkin), template_key, created_at
user_blocks            blocker_id, blocked_id, created_at
user_availability      user_id, slot (0..20 = day*3+part), pk (user_id, slot)
institution_domains    domain, institution_normalised, verified_by_admin
user_stats             + reliability_attended, reliability_window (last 20 as bitmask), rest_days_used_week,
                         freezes_available, freezes_used, league_id
leagues                id, week_key, level, tier
league_members         league_id, user_id, credits_week
groups                 + kind, purpose, ends_on, archived_at
group_members.role     + verifier
tasks                  + assigned_by, actual_minutes, start_by (owner override of the derived latest start);
                       status + partly|disputed|unverified
task_reviews.action    + didnt_happen;   rating becomes private
credit_ledger.reason   + session_minutes|coop_bonus|recurrence_bonus  (abandon_penalty removed)
users                  + is_verified_institution, quiet_hours_start, quiet_hours_end, leagues_opt_out
```

## Appendix B — Screen map (web first)

```
Home (new tab, replaces Feed as first)   Today: next session (countdown / Join), today's tasks with
                                          "bring to session", streak + rest-day control, group streaks
Sessions                                  Week view: scheduled + recurring; Start a 25/50/90; Find a partner (scheduled match)
  Live session                            Shared clock, presence strip, my task list, status verb, nudge on late avatar,
                                          check-in reply; break countdown; End → debrief
  Debrief                                 Self-report per task, one word, proof; Post as card
Groups                                    List with next-session time; Group: schedule, tasks (assign/claim), members
                                          with reliability band + roles, health line, chat (locked/open state visible)
Buddies                                   Now · Scheduled · Campus rooms   (three doors)
Feed                                      Campus · Subject · Everyone; composer defaults to session/experience/ask
Board                                     My league this week; badges; all-time (buried)
Profile                                   + availability grid, reliability band, semester grid, quiet hours, opt-outs, blocks
```

## Sources consulted

- Focusmate attendance score, 5-minute no-show rule, auto-cancel:
  https://www.focusmate.com/blog/feature-update-july-2018-attendance-score-booking-limits/ ·
  https://support.focusmate.com/en/articles/4044431-what-if-i-don-t-get-a-match-or-my-partner-doesn-t-show ·
  https://www.focusmate.com/faq/
- YPT (Yeolpumta) group timers, live presence, category rankings:
  https://apps.apple.com/us/app/ypt-study-group/id1441909643 ·
  https://play.google.com/store/apps/details?id=com.pallo.passiontimerscoped
- Duolingo streak freezes, Streak Society, Friend Streaks, retention figures:
  https://duolingo.deconstructoroffun.com/mechanics/streaks ·
  https://duoplanet.com/duolingo-streak-freeze/ ·
  https://duolingoguides.com/duolingo-friend-streak/
- Flown, Caveday, body-doubling formats and reported outcomes:
  https://flown.com/blog/adhd/flown-vs-caveday ·
  https://www.smithsonianmag.com/innovation/can-virtual-coworking-platforms-make-us-more-productive-180984439/ ·
  https://www.flow.club/blog/body-doubling-adhd
- Commitment devices and accountability evidence (Matthews 2007; anti-charity stakes):
  https://finestreak.com/blog/commitment-devices-that-work ·
  https://dl.acm.org/doi/10.1145/3411764.3445295
- Forest study community (24/7 hosted rooms, 300+ online at 2am in finals):
  https://disboard.org/server/454897894672302080 ·
  https://pogether.com/en/best-virtual-study-room-apps/
