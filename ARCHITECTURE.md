# Buddy — Architecture & Stack Proposal (v2)

> Status: **CONFIRMED (v2.1, 2026-08-25)** — building from this document. Changes from v1: React Native/Expo for iOS + Android, email/password auth, goal + occupation in registration and in the buddy profile, 5-minute buddy-request expiry with countdown. Remaining `[DECISION]` items use the proposed defaults unless changed later.

---

## 1. Summary of the recommendation

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native + Expo (SDK 57, TypeScript)**, Expo Router, iOS + Android | One codebase for both platforms, same language as the backend, and end-to-end type sharing with the API through a shared package. |
| API | **Cloudflare Workers + Hono (TypeScript)** | Standard Workers framework: tiny, typed routing, middleware, and **Hono RPC** gives the app a fully typed client straight from the route definitions. |
| Shared code | `packages/shared` — Zod schemas, types, constants (credit rules, goal/occupation lists, badge definitions) | Validation rules and enums live once and are used by both API and app. |
| Database | **D1 (SQLite) + Drizzle ORM** | Relational data (users, groups, tasks, reviews, credits). Drizzle gives typed queries and migration files that `wrangler d1 migrations` applies. |
| Real-time chat | **Durable Objects** (one per group, WebSocket Hibernation API) | One coordinator per group fans out messages to connected members. Hibernation keeps it nearly free while idle. |
| File storage | **R2** | Avatars now; optional photo proofs later. Uploaded via presigned URLs from the Worker. |
| Transactional email | **Cloudflare Email Service (Email Sending binding)** | Email verification codes and password-reset codes, sent from your own domain — stays inside Cloudflare. |
| Push notifications | **Queues → Expo Push Service** (delivers to APNs + FCM) | Push to Apple/Google devices is inherently external; Expo Push is the standard Expo integration and handles both platforms with one token type. `[DECISION]` see §4.6 for the direct-APNs/FCM alternative. |
| Scheduled jobs | **Cron Triggers** | Hourly "end of day" rollover per user timezone (missed tasks, streaks, badges), weekly leaderboard snapshot. |
| Cache / rate limit | **KV** (leaderboard snapshots) + **Rate Limiting binding** | Leaderboard is read-heavy and cheap to precompute; rate limiting protects login, requests, invites, reports. |
| Content moderation | **Workers AI** (Llama Guard) — *optional, phase 2* | Auto-flag abusive chat/proof text alongside user reports. |
| Auth | **Email + password** → short-lived access JWT (15 min) + rotating refresh token (D1). Email verified by 6-digit code. | Passwords hashed with PBKDF2-SHA256 (WebCrypto, OWASP parameters); no third-party auth provider. |
| Builds / deploy | Expo **EAS Build** for app binaries; Wrangler for the API; GitHub Actions runs lint + typecheck + tests + a Metro bundle; Vitest (`@cloudflare/vitest-plugin`) + Jest/RNTL | |

Backend cost: Workers **Paid plan ($5/mo)** covers everything at early scale. Expo EAS has a free tier for builds.

### Considered and rejected
- **Native SwiftUI**: best iOS polish, but you now want Android too → Expo wins.
- **Sign in with Apple / Google**: not needed for email+password; App Store only requires Sign in with Apple if you offer *other* social logins. Can be added later.
- **Storing chat messages inside the Durable Object's SQLite**: fast, but moderation/reports can't query across groups. v1 keeps **D1 as the single source of truth**; the DO only does live fan-out. `[DECISION]`
- **bcrypt/argon2 on Workers**: need WASM and are CPU-heavy; PBKDF2 is native in WebCrypto and OWASP-approved at 600k iterations.

---

## 2. Product rules (please correct anything wrong)

### 2.1 Registration & profile

**Revised 2026-08-31 — students only, and questions before the account.**

Buddy is now a student product (school through PhD). Signup asks nine questions
*before* an account exists, and creates the account last:

1. **Level of study** — High school · Foundation/College · Undergraduate ·
   Master's · PhD · Postdoc · Recent graduate. Stored as `education_level`.
2. **Institution** (free text) + optional city.
3. **Major / field of study** — chips + "Other", stored as `major_key` +
   `major_text`, the same pair-of-columns pattern as goals.
4. **Where you're from** — ISO 3166-1 alpha-2, stored as `country`.
5. **Goal** — unchanged, still up to `MAX_GOALS`, still the heaviest term in
   matching.
6. **Favourite topics** (max 3) and 7. **hobbies & interests** (max 5), both in
   `user_tags`.
8. **Bio** — a free line, optional.
9. **"Are you willing to be someone's buddy?"** + headline and availability.

Then **email + password + `@handle`** → 6-digit code → verified → one
`PATCH /me` writes every answer → optional avatar prompt. (A subscription step
would sit between verification and the write; skipped for now.)

Three consequences worth recording:

- **The questions precede the account**, so the answers live in a
  sessionStorage-backed draft (`apps/web/src/onboarding/draft.ts`) until there
  is somewhere to write them. That is what makes the flow survive the trip to a
  mail client for the verification code. The rationale is Finch's: the first
  screen is where abandonment concentrates, and personalising before collecting
  costs nothing while asking for a password first costs the user.
- **`@handle` is claimed at registration**, because it is the one answer checked
  against every other user, and a collision should surface on the screen it was
  typed on. It stays optional on the wire so the mobile app, which still claims
  one during onboarding, is unaffected.
- **The occupation *question* is gone; the column is not.** `occupation_key` is
  indexed, CHECK-constrained and read by `apps/mobile`, so `PATCH /me` derives
  it from the level of study via `OCCUPATION_FOR_LEVEL`. An explicit
  `occupationKey` in a patch still wins, which is what the app sends.
- **Onboarding completion** is now "a claimed handle (not the registration
  placeholder), a goal, and a level **or** an occupation". The disjunction is
  load-bearing: mobile never sends a level, and requiring one would leave every
  app user stuck in the onboarding gate.

**Institutions are free text**, so "the same institution" is a definition rather
than a comparison. `normaliseInstitution()` in `packages/shared` is that
definition — it folds case, accents, punctuation, dotted acronyms (`M.I.T.` =
`MIT`) and a leading "the" — and the result is stored in
`institution_normalised` so the comparison is an indexed equality. It has
exactly one definition because two things depend on it: the "same institution as
me" filter and the `sameInstitution` term in the match score. If they disagreed,
the sort would rank someone the filter had hidden. It deliberately does not
attempt fuzzy matching; silently merging two schools is worse than missing a
match.

---

The original flow, for reference:

1. **Email + password** → we send a 6-digit verification code by email → verified.
2. **Identity**: display name, unique `@handle`, avatar (optional), timezone (auto-detected).
3. **Goal** — "What are you working toward?" Pick one suggestion chip **or** type your own:
   `Final exam · University project · Thesis / dissertation · SAT · IELTS / TOEFL · Getting fit · Learning a language · Job hunting · Building a startup / side project · Reading habit · Coding / learning to program · Other (write it)`
   Stored as `goal_key` (from the list, or `custom`) + `goal_text` (free text, always shown).
4. **Occupation** — pick one **or** type your own:
   `Student — High school · Student — Undergraduate · Student — Graduate (Master's / PhD) · Employee · Self-employed / Freelancer · Job seeker · Other (write it)`
   Stored as `occupation_key` + `occupation_text` (e.g. field of study, job title — optional free text).
5. **"Are you willing to be someone's buddy?"** (toggle, changeable later). If yes → **buddy profile**, which consists of:
   - **Goal** and **occupation** (pre-filled from steps 3–4; editable here, and they are the first two lines of every buddy card),
   - headline (one line), about me (a few sentences), availability (e.g. "Evenings, weekdays"), preferred check-in style (optional).

Goal + occupation are collected from **everyone** (not only open buddies) because they drive matching in both directions; for open buddies they are also the headline facts of the buddy profile that a prospective buddy reviews before sending a request. The suggestion lists live in `packages/shared` so you can edit them without code changes elsewhere.

### 2.2 Buddy directory & requests (for users who know nobody)
- The directory lists users with `is_open_buddy = true` (excluding self and existing group-mates), each as a card: avatar, name, **goal**, **occupation**, headline, activity indicator ("Active now / Active 12 min ago"), credits, streak, reviews given, badges.
- Default sort: **Recommended**, a score computed in SQL. **Revised 2026-08-31:**
  the weights are powers of two, which makes the ranking strictly lexicographic —
  each signal outweighs every weaker signal *combined*, so the order is the whole
  rule: `sameGoal` (128) → `sameInstitution` (64) → `sameMajor` (32) →
  `sameOccupation` (16) → `sameLevel` (8) → `sharedTopic` (4) → `sameCountry` (2)
  → `activeNow` (1). Hand-tuned weights would mean that adding a signal quietly
  changes what the existing ones mean, and three small matches would start
  outranking a shared goal with nothing to announce it.
- Second sort: **Points**, by total credits. Each sort needs its own keyset
  cursor, so the cursor carries its sort and a mismatched one restarts from the
  first page rather than paging through a comparison that means nothing.
- Filters: level of study, subject, topic, goal, country, "active in the last
  15 min", and **"same institution as me"** — a toggle rather than a list,
  because institutions are free text and there is nothing to enumerate.
- Tapping a card opens the **full buddy profile** (about me, availability, badges, stats, member since) so the user can learn about them before requesting.
- **Send request** (optional short message). Rules:
  - Only **one pending request at a time** per requester.
  - The request **expires 5 minutes** after it's sent. `[DECISION]` confirm 5 min (it's a config constant).
  - The requester sees the chosen buddy pinned at the top of the directory with a **live countdown** under their name ("Waiting for Ana · 4:32"). While waiting, other "Request" buttons are disabled.
  - The recipient gets an immediate **push notification** ("Ellie wants you as a buddy — respond within 5 min") and an in-app banner; they can **Accept** or **Decline**.
  - Accept → a 2-person group is created automatically (named "Ana & Ellie"), both are taken to it.
  - Decline or timeout → the requester is told ("No answer from Ana — try another buddy") and can immediately request someone else. Expired/declined recipients can be re-requested later (proposal: after 1 hour, to avoid spamming). `[DECISION]`
- Because a 5-minute window only works if the recipient is reachable, the directory highlights recently active buddies and defaults to sorting them first.

### 2.3 Groups
A user creates a group and invites people they already know by `@handle`. Any number of members. Group invites don't expire in 5 minutes (they're for friends), they stay pending for 7 days. Every group gets a chat room.

**Added 2026-08-31 — join links.** §5.2 originally recorded that share-link
invites were "not in v1; @handle covers the same need". It does not: a handle
can only name somebody who already signed up, which made every group a closed
room and every new member somebody else's problem to recruit. Links live in
`group_invite_links` rather than as a nullable `to_user_id` on `group_invites` —
a targeted invite names one recipient and is accepted once, a link names nobody
and is used many times, and sharing a table would make every existing invite
query check which kind of row it held. A link expires in 7 days, is capped at
`INVITE_LINK_MAX_USES`, and can be revoked.

The preview (`GET /invite-links/:token`) is **unauthenticated**, deliberately.
Someone arriving from a WhatsApp message is about to be asked nine questions, an
email address and a password, and asking all that before saying what they are
joining is how you lose them. The link already grants entry to anyone holding
it, so naming the group to a holder discloses nothing the link does not — but it
returns only the group name and the inviter, never the member list. A leaked link
should not become a roster.

On the web the token rides in the signup draft (`sessionStorage`) through the
whole questionnaire and the email round trip, and is redeemed at
`/onboarding/done`, so an invitee lands in the group rather than on a generic
home screen.

### 2.4 Daily tasks & the review loop
- Each member writes the tasks they plan to finish **today** (their local day). Tasks not completed by local midnight become **missed**.
- Owner marks a task **Done**, optionally attaching a text explanation (proof).
- A buddy in the group reviews it: **Approve with rating 0–5**, or **Request proof** (task goes back to owner as *proof requested*). Owner submits/updates the proof → buddy reviews again → Approve with rating (0 effectively rejects).
- **Decided 2026-08-27:** in groups with 3+ members, **any other member can review and the first review is final**. Enforced by a guarded `UPDATE ... WHERE status='done' RETURNING`, not by a status read followed by a write — two reviewers tapping simultaneously would both pass the latter.
- **Decided 2026-08-27:** a rating of **0 still approves**. It closes the task and counts toward the streak and the daily bonus; it simply earns no credits. `TASK_STATUSES` has no rejected state, and adding one would leave tasks stuck with nowhere to go.
- **Added 2026-09-02 — a proof may be a photo, and the photo is group-private.** `tasks.proof_image_key` existed from `0000_init` but nothing wrote it. The upload reuses the avatar's two-step protocol (`POST /api/me/proof-image` → PUT to the Worker) under a `proofs/<userId>/` prefix, and the prefix is the access rule: `media.ts` serves `avatars/` and `posts/` unauthenticated on the reasoning that every signed-in user can already see them, and it says in so many words that proof images "are group-private and will need a different, authenticated path". That path is `GET /api/tasks/:id/proof-image`, which re-checks group membership on **every read** — leaving a group has to stop the images resolving, and an unguessable key is not an access control. It answers `private, no-store` rather than `/api/media`'s year-long immutable cache, and `404`s rather than `403`s for a non-member, so a stranger cannot learn the task exists. A client-supplied key is re-checked against the caller's own prefix, exactly as `posts.ts` does, so nobody can attach somebody else's upload to their own task.
- **Consequence for the client:** a browser will not put an `Authorization` header on an `<img src>`, and the API's `secureHeaders()` CORP means the app's images are already `crossOrigin` CORS requests. So the reviewer's proof photo is fetched as a blob and shown as an object URL (`useProofImage`), with the revoke tied to the component's lifetime — a cached one would leak a blob per proof viewed.
- **Added 2026-09-02 — reporting a proof photo.** The report path is the one that already exists (`ReportSheet`, `targetType: 'task'`); what is new is a flag icon *on the proof itself*, because "this picture should not be here" is a different claim from "this work was not done" and needs to be reachable without reading the actions below it. It carries a new reason, "Photo is inappropriate or explicit"; `reports.reason` is deliberately not CHECK-constrained, so a new reason costs nothing. **This is a safety control, not a moderation system** — there is no scanning, no EXIF stripping and no automatic takedown, and the image stays visible to the group until an admin acts on the report.

### 2.5 Credits, streaks, badges, leaderboard
- On approval: `credits = rating × 10`; **+20 daily bonus** if every planned task of the day is approved. `[DECISION]` (constants in `packages/shared/config`)
- Streak = consecutive days with at least one approved task.
- **Badges** at credit thresholds (100 / 500 / 2,000 / 10,000) + behavioural ones (first approved task, 7-day streak, 30-day streak, "Helpful buddy" = 50 reviews given). Badge list is data, editable.
- **Leaderboard**: weekly (resets Monday 00:00 UTC) and all-time, global. `[DECISION]` add per-group leaderboard too?

### 2.6 Reports & chat
- Any member can report a proof, a chat message, a user, or (from 2026-08-31) a Feed post — reason + note. Reports go to a simple admin endpoint for you to review. `[DECISION]` auto-hide content after N reports, or manual only?
- Chat: real-time text per group, history, push when backgrounded. No typing indicators / read receipts in v1.
- **Sender clarity (2026-08-31).** Messages always carried the sender's name; a
  group of three or more needs to tell people apart *without reading*, so the
  name now carries a stable colour derived from the user id and an avatar sits
  beside the bubble. The colour comes from the id rather than a list position so
  it does not change when someone joins or a page of history loads above.
- **The focus lock (2026-08-31).** While one of a member's tasks is running, that
  member cannot post to that group's chat. Enforced in `GroupChat`
  by a D1 read on **every inbound message**, not by state held in the object and
  set over RPC. State would be faster and wrong: one missed unlock — a rollover,
  a future endpoint, a retry that fails after the write — would lock someone out
  of their group chat permanently. Reading the truth each time is self-healing,
  and costs one indexed read beside a write the handler already does. An RPC
  (`noteFocusChange`) exists only to grey the composer promptly; correctness does
  not depend on it arriving.

### 2.7 The Feed — added 2026-08-31

A photo, an optional caption, and reactions from a fixed positive set (heart,
like, fire, clap, book, brain). No comments.

**Global**: every signed-in user sees every post. The alternative — scoping to
groups — is safer and largely self-moderating, but leaves a brand-new account
with no group looking at an empty screen, and this is the one surface that can
give them something. The cost is a public photo surface, which is why `post` is
in `REPORT_TARGETS` from the first day rather than later.

Reactions are a closed list on purpose. Buddy is built on other people rating
your work; the Feed should not also hand them a way to boo. `post_reactions` is
keyed `(post_id, user_id, reaction)`, which makes a reaction a toggle rather than
a counter — a second tap deletes the row it would otherwise duplicate.

Images upload through the avatar's two-step protocol under a `posts/` prefix and
are served by the same unauthenticated media route, on its own reasoning: every
signed-in user can already see every post, and a bearer token on an `<img>` would
defeat the CDN cache for no privacy gained.

**Account deletion removes posts outright.** Deleting an account is a *soft*
delete, so `ON DELETE cascade` never fires — the same reason the handler already
deletes web-push rows by hand. Unlike a chat message, a post is not part of
anyone else's history, so there is nothing lost by removing it.

---

## 2.8 Age, and who this is for — added 2026-09-02

**`middle_school` is now the youngest level offered**, which makes this worth
writing down rather than leaving implied.

**The floor is 16, and it is enforced.** `MIN_AGE_YEARS` in
`packages/shared/src/age.ts` is the single place it lives; `dateOfBirthSchema`
reads it, so `PATCH /me` refuses an under-age date whether or not the client
asked nicely. `users.date_of_birth` (0010, a plain ADD COLUMN) stores the answer,
and `PATCH /me` writes it **only when the column is null** — an age gate that can
be edited away afterwards is not a gate, and the profile editor patches the same
route.

**Why 16 rather than the 13 the law floors at.** Thirteen is what US COPPA and UK
GDPR set and what most consumer apps use. Buddy matches *strangers*, gives them
private chat, and accepts photographs from them (§2.4). Sixteen clears every EU
member state's Article 8 threshold without per-country consent logic and matches
Australia's minimum-age regime. It does **not** clear the UK's Age Appropriate
Design Code or Ofcom's children's duties, which cover everybody under eighteen:
this is a floor, not an exemption.

**The question is asked first**, before institution, subject or goals. It is the
only question whose answer can end the signup, so asking it last would mean
collecting eight answers from somebody about to be turned away — and collecting
nothing at all from someone under the floor is the point. `FIRST_STEP` is read
from `SIGNUP_STEPS` by the landing page and the welcome screen rather than
written out, because this change moved it once already.

**What the gate is not.** It is self-reported, and nothing verifies it. A
determined fifteen-year-old types a different year. That is why the floor is not
printed above the empty input — a number shown before the field is an
instruction for what to enter — and why this stops the careless case rather than
the motivated one. Real assurance means identity or payment signals the product
does not have.

**Two things it deliberately does not do.** Accounts created before 2026-09-02
have a null date of birth and are left alone: an unanswered age is not a young
one, and there is nothing honest to backfill. And `apps/mobile` does not ask the
question yet, so the gate binds the web signup only.

**Note the tension with `middle_school`.** The level was added the same day the
floor was set at 16, and middle school is ordinarily 11–14. Almost nobody who
can pass the gate is in it. The two are consistent only for an unusual case, and
the honest options are to drop the level, lower the floor, or accept that the
option is effectively dead.

---

## 3. System diagram

```
┌────────────────────┐   HTTPS (Hono RPC, JSON)     ┌─────────────────────────────────┐
│  Expo app          │ ────────────────────────────▶ │  Worker: api  (Hono, TS)        │
│  iOS + Android     │                               │  ├─ /auth/*  register/login/    │
│                    │   WSS /groups/:id/chat        │  │           verify/reset/refresh│
│                    │ ───────────────┐              │  ├─ /me, /users, /buddies       │
│                    │                │              │  ├─ /buddy-requests (5-min TTL) │
│  push (APNs/FCM) ◀─┼──────┐         │              │  ├─ /groups, /invites, /tasks   │
└────────────────────┘      │         │              │  ├─ /reviews, /leaderboard      │
                            │         ▼              │  └─ /badges, /reports, /admin   │
                            │  ┌──────────────┐      └──┬─────┬─────┬─────┬─────┬──────┘
                            │  │ Durable Obj. │         │     │     │     │     │
                            │  │ GroupChat    │         ▼     ▼     ▼     ▼     ▼
                            │  │ (1 per group)│──────▶ ┌───┐┌───┐┌───┐┌─────┐┌───────┐
                            │  └──────────────┘        │D1 ││R2 ││KV ││Email││Queue  │
                            │                          └───┘└───┘└───┘└─────┘└──┬────┘
                            │        ┌───────────────────────────────────────────┘
                            │        ▼
                            │  ┌──────────────┐      ┌───────────────────────┐
                            └──│ queue handler│      │ Cron Triggers         │
                               │ → Expo Push  │      │ hourly: day rollover  │
                               └──────────────┘      │ weekly: leaderboard   │
                                                     └───────────────────────┘
```

One Worker (`api`) with `fetch` (REST + WebSocket upgrade), `queue` (push delivery), and `scheduled` (crons). One deploy, one set of bindings.

---

## 4. Backend design (Cloudflare)

### 4.1 Bindings (wrangler.jsonc)
Provisioned on account `Masoud` (`fdfb5a64d3ba5cf9680d372ae66487a2`) on 2026-08-27:

```
DB            → D1 database "buddy"          id 9cac77ca-1f50-4036-a470-0211dfa7c753  ✅ created
STORAGE       → R2 bucket "buddy-media"                                               ✅ created
CACHE         → KV namespace "buddy-cache"   id 8a946df02c8b4308b4266b3a191b4bec      ✅ created
EMAIL         → Email Sending binding, from no-reply@localrack.xyz          (decided 2026-08-27)
GROUP_CHAT    → Durable Object class GroupChat (SQLite-backed)
PUSH_QUEUE    → Queue "buddy-push"
RATE_LIMITER  → (not used) rate limiting is KV-based — see lib/rate-limit.ts
AI            → Workers AI (phase 2)
secrets:  JWT_SECRET, EXPO_ACCESS_TOKEN, ADMIN_TOKEN
```

### 4.2 Data model (D1 / Drizzle)

```
users            id, email (unique, lowercase), email_verified_at, password_hash, password_salt,
                 handle (unique), display_name, avatar_key, timezone,
                 goal_key, goal_text, occupation_key, occupation_text,
                 is_open_buddy, last_seen_at, created_at, deleted_at
buddy_profiles   user_id (pk), headline, about, availability, checkin_style, updated_at
email_codes      id, user_id, purpose (verify|reset), code_hash, expires_at, consumed_at, attempts
devices          id, user_id, expo_push_token (unique), platform (ios|android), updated_at
refresh_tokens   id, user_id, family_id, token_hash, expires_at, revoked_at

groups           id, name, emoji, created_by, kind (friends|matched), created_at
group_members    group_id, user_id, role (owner|member), joined_at   (pk: group_id,user_id)
group_invites    id, group_id, from_user_id, to_user_id, status (pending|accepted|declined|expired),
                 expires_at (+7d), created_at, responded_at
buddy_requests   id, from_user_id, to_user_id, message,
                 status (pending|accepted|declined|expired),
                 expires_at (+5 min), created_at, responded_at
                 → partial unique index: one PENDING request per from_user_id

tasks            id, user_id, group_id, title, notes, due_date (YYYY-MM-DD local),
                 status (planned|done|proof_requested|approved|missed),
                 proof_text, proof_image_key, done_at, created_at
task_reviews     id, task_id, reviewer_id, action (approve|request_proof), rating (0-5 | null),
                 comment, created_at
credit_ledger    id, user_id, amount, reason (task_approved|daily_bonus|streak|admin_adjust),
                 ref_type, ref_id, created_at      ← append-only; balances are sums
user_stats       user_id (pk), total_credits, weekly_credits, week_key, current_streak, best_streak,
                 tasks_approved, reviews_given     ← denormalised, updated in the same transaction
user_badges      user_id, badge_key, awarded_at    ← badge definitions live in packages/shared/src/badges.ts (config, not a table)
messages         id, group_id, sender_id, body, created_at, deleted_at
reports          id, reporter_id, target_type (task|message|user), target_id, reason, note,
                 status (open|actioned|dismissed), created_at, resolved_at
```
IDs are ULIDs; timestamps ISO-8601 UTC. `last_seen_at` is bumped (at most once per minute) by any authenticated request and by the chat socket, and powers the "Active now" indicator.

**Widening an enum column, and why it costs a new column (0009, 2026-09-02).**
`users` carries CHECK constraints generated from the shared enums, and SQLite
can only change a CHECK by rebuilding the table. 0003 warned that the rebuild is
unsafe here; 0009's commit proved it, in workerd against real D1: `PRAGMA
foreign_keys` reads `1`, and `DROP TABLE users` took a child row with it (1 → 0).
`PRAGMA foreign_keys=OFF` is a no-op inside the transaction D1 wraps a migration
in, and `defer_foreign_keys=ON` does not stop the cascade either — both tested.
**Thirty** `ON DELETE CASCADE` foreign keys point at `users`, so rebuilding it is
not a risk to weigh but a way to empty the database.

So `middle_school`, `geography`, `religious_studies` and `drama` arrived as two
new columns — `education_level_v2` and `major_key_v2` — backfilled from the
originals, indexed in their place, and carrying **no CHECK**. That last part
follows `goal_keys` in 0006: a constraint that can only be widened by rebuilding
can never be widened, and Zod already rejects any key outside the shared enums at
the edge. The frozen columns stay exactly as they were, still holding what they
held; `schema.ts` spells their constraints out in `FROZEN_LEVEL_KEYS` and
`FROZEN_MAJOR_KEYS` rather than generating them, so a future addition to the
shared lists cannot silently make drizzle-kit reach for the rebuild again.

Nothing outside `schema.ts` changed: Drizzle's `educationLevel` and `majorKey`
fields simply point at the new columns, so all twenty-odd call sites — the
directory's match score, its filters, `PATCH /me`, the buddy card — kept working
untouched.

### 4.3 Auth flow
```
POST /auth/register      {email, password, displayName}      → creates user (unverified), emails 6-digit code
POST /auth/verify-email  {email, code}                        → marks verified, returns tokens
POST /auth/resend-code   {email}
POST /auth/login         {email, password}                    → tokens (401 generic message on any failure)
POST /auth/refresh       {refreshToken}                       → rotated pair; reuse of an old token revokes the family
POST /auth/logout
POST /auth/forgot        {email}                              → emails reset code (always 200)
POST /auth/reset         {email, code, newPassword}           → revokes all sessions
POST /auth/change-password (authenticated)
DELETE /me               account deletion (required by both stores)
```
- Password policy: ≥ 8 chars, checked against a small common-password list; hashed with **PBKDF2-SHA256, 16-byte salt** (WebCrypto), at an effective **600,000 iterations reached as 6 chained rounds of 100,000**. The runtime rejects any single `deriveBits` call above 100,000 (`NotSupportedError: iteration counts above 100000 are not supported`) and **Miniflare does not enforce that cap**, so the original single-call form passed all 123 tests and 500'd on the first real deploy. Each round feeds its output into the next, so the work stays sequential and the factor is unchanged.
- Codes: 6 digits, 10-minute expiry, max 5 attempts, hashed at rest.
- Rate limits: login 10/15 min per email+IP, register 5/hour per IP, code resend 3/10 min.
- Access JWT: 15 min, HS256. Refresh: 30 days, rotating, stored hashed.

### 4.4 API surface (v1, beyond auth)
```
GET/PATCH /me                      profile, goal, occupation, timezone, is_open_buddy, buddy profile
POST   /me/avatar                  → upload key + URL (the Worker takes the PUT;
                                   R2 presigning would need an access-key pair in
                                   the app, a binding-backed PUT keeps it server-side)
PUT    /me/avatar/:key             the image bytes, key re-checked against the caller
GET    /api/media/avatars/...      public read — see routes/media.ts for why
POST   /me/devices                 {expoPushToken, platform}
GET    /users/:handle              public profile (goal, occupation, stats, badges, buddy profile if open)

GET    /buddies?goal=&occupation=&activeOnly=&cursor=     directory, sorted by match score
POST   /buddy-requests             {toUserId, message?}   → 409 if one already pending; returns expiresAt
GET    /buddy-requests/current     my pending request (for the countdown) — 404 when none
GET    /buddy-requests/incoming    pending requests addressed to me
POST   /buddy-requests/:id/accept  → creates group, returns it   (410 if expired)
POST   /buddy-requests/:id/decline
POST   /buddy-requests/:id/cancel  (requester gives up early)

GET    /groups      POST /groups {name, emoji}      GET /groups/:id      POST /groups/:id/leave
POST   /groups/:id/invites {handle}      GET /invites      POST /invites/:id/accept|decline
GET    /groups/:id/messages?before=      POST /groups/:id/chat-ticket
GET    /api/chat/:groupId?ticket=  (WS)  ← not under /groups: that prefix is
                                          wrapped in bearer auth, which would
                                          reject a ticket-authenticated socket

GET    /tasks?groupId=&date=       POST /tasks   PATCH /tasks/:id   DELETE /tasks/:id
POST   /tasks/:id/done             {proofText?, proofImageKey?}
POST   /tasks/:id/proof
POST   /tasks/:id/review           {action: approve|request_proof, rating?, comment?}

GET    /leaderboard?scope=weekly|alltime&cursor=     + my rank
GET    /badges      GET /me/badges
POST   /reports     GET/PATCH /admin/reports (ADMIN_TOKEN)
```
Routes are defined with Zod validators from `packages/shared`; the app imports the Worker's `AppType` and calls it through Hono's `hc<AppType>()` client — request and response types are checked at compile time.

### 4.5 Buddy-request expiry (5 min) — how it's enforced
- `expires_at = created_at + 5 min` is set server-side and returned to the app; the **countdown is driven by the server timestamp**, not the phone clock.
- **Lazy expiry**: every read/write that touches a pending request first runs `UPDATE buddy_requests SET status='expired' WHERE status='pending' AND expires_at < now`. No cron needed, no race with the accept endpoint (accept checks `expires_at` in the same statement).
- While a request is pending, the requester's app polls `GET /buddy-requests/current` every 5 s (cheap, and it also delivers the "accepted" moment instantly); a push is sent as well.
- On acceptance the recipient's accept call creates the group in one D1 batch and enqueues a push to the requester.

### 4.6 Push notifications

Two transports, one queue. A route enqueues `{userIds, title, body, data}` and
the consumer resolves that to whatever devices those users actually have, so
none of the ten call sites knows there is more than one way to reach a person.

**Mobile — Expo.** The app registers an **Expo push token** (works for both APNs
and FCM). The consumer batches to `https://exp.host/--/api/v2/push/send` in
chunks of 100; receipts are checked and `DeviceNotRegistered` tokens deleted.
Requires an APNs key uploaded to EAS (iOS) and FCM V1 credentials (Android —
Google mandates FCM for Android push regardless of provider).

**Web — Web Push, direct from the Worker.** No third party: the Worker signs a
VAPID JWT (RFC 8292, ES256) and encrypts the payload itself (RFC 8291: ECDH
P-256 → HKDF → AES128GCM, one record, `aes128gcm` content coding), then POSTs to
the subscription's endpoint. All of it is WebCrypto, which the Workers runtime
implements natively, and `test/web-push.test.ts` pins the encryptor against the
RFC's own published intermediate values so a misreading of the spec fails the
suite rather than producing something no browser can decrypt. 404 and 410 delete
the subscription — the browser's `DeviceNotRegistered`.

Ordering and failure handling are deliberate. Expo runs first, because it is the
half that throws to retry the whole queue batch; a browser notification sent
before that throw would be delivered twice, and Web Push has no de-duplication.
Web failures are caught per subscription and never thrown, because throwing
would re-send everyone else's notifications on both transports.

Without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` the web branch no-ops, so the
API is safe to deploy before the secrets exist. **The migration is not
optional in the same way**: once the secrets are set, the consumer queries
`web_push_subscriptions` on every batch, and a missing table would fail the
batch for mobile too. Order is: apply migrations remotely, deploy the API, set
the secrets, deploy the web client.

- `[DECISION]` Web Push subscriptions live in their own table rather than in
  `devices`. They share no column with it — no Expo token, no `platform` from
  `PLATFORMS` — and folding them in would have meant dropping a NOT NULL and
  rebuilding a CHECK constraint, neither of which SQLite can alter in place.
- `[DECISION]` No `web-push` library. It is four WebCrypto calls and a header
  layout, fully specified and pinned to published test vectors, against a
  dependency in the same blast radius as the auth path — the same call already
  made for PBKDF2 hashing and the rate limiter.
- `[DECISION]` Alternative with no Expo server in the path for mobile either:
  the Worker talks to APNs (HTTP/2, ES256 token) and FCM HTTP v1 (Google service
  account) directly. ~2× the integration code, two token types, no third party.
  Recommendation stands: Expo Push for v1; the queue-consumer interface is the
  same, and the Web Push half is now proof that the consumer can hold a
  hand-rolled transport next to it.

### 4.7 Durable Object: `GroupChat`
- One per group (`idFromName(groupId)`); the client connects with a 60-second **ticket** issued by REST after a membership check.
- Hibernation API → zero cost while idle. On message: validate → insert into D1 → broadcast → enqueue push for members not connected. Membership changes are forwarded to the DO so removed members are disconnected.

### 4.8 Task state machine
```
planned ──done──▶ done ──approve(rating)──▶ approved  (credits, stats, badges in one transaction)
   │                │
   │                └──request_proof──▶ proof_requested ──submit proof──▶ done
   └── local midnight passes (hourly cron) ──▶ missed
```

### 4.9 Background work
- **Queue consumer**: push delivery (§4.6).
- **Cron hourly**: for every timezone that just hit 00:00 → mark yesterday's `planned` tasks `missed`, compute streaks and daily bonus, award badges.
- **Cron weekly (Mon 00:05 UTC)**: freeze the week's leaderboard into KV, reset `weekly_credits`.
- Leaderboard reads come from a KV snapshot refreshed every 5 minutes (stale-while-revalidate).

### 4.10 Backend repo layout
```
apps/api/
  wrangler.jsonc
  drizzle/                     SQL migrations (drizzle-kit)
  src/
    index.ts                   fetch / queue / scheduled entry points; exports AppType
    env.ts                     typed bindings
    db/schema.ts               Drizzle schema
    routes/                    auth, me, users, buddies, buddy-requests, groups, invites, tasks,
                               reviews, chat, leaderboard, badges, reports, admin
    services/                  password.ts, tokens.ts, email.ts, credits.ts, badges.ts, streaks.ts,
                               matching.ts, push.ts, leaderboard.ts
    durable/GroupChat.ts
    jobs/                      rollover.ts, weekly.ts
    lib/                       ids, errors, rate-limit, time
  test/                        Vitest (Workers pool: real D1/DO/KV locally)
```

---

## 5. Mobile app design (Expo)

### 5.1 Stack
- **Expo SDK 57** (React Native 0.86, React 19.2, **New Architecture — mandatory since SDK 55, no opt-out**), **TypeScript (strict)**, **Expo Router** (file-based navigation, deep links for push). Requires Node ≥ 22.13 (this machine: 22.23 ✅).
- **State**: TanStack Query for server data (caching, refetch, optimistic updates) + a small Zustand store for session/auth.
- **API client**: Hono `hc<AppType>()` wrapped with auth (token attach, refresh-on-401, retry).
- **Storage**: `expo-secure-store` for tokens; TanStack Query persistence (AsyncStorage) for a snappy cold start. No offline editing in v1.
- **Chat**: built-in `WebSocket` with reconnect/backoff; messages merged into the Query cache.
- **Push**: `expo-notifications` (token registration, foreground banners, tap → deep link).
- **Media**: `expo-image-picker` + direct PUT to the presigned R2 URL; `expo-image` for rendering.
- **UI**: **NativeWind v4 (`nativewind@4.2.6`) pinned with `tailwindcss@^3.4`** + a small in-house component kit (Button, Card, TaskRow, RatingPicker, BadgeChip, Countdown). NativeWind 4's peer range (`>3.3.0`) would silently pull Tailwind 4.x, which it does not support — both versions are pinned. NativeWind 5 is still `preview` and is not used. `[DECISION]` alternative: plain StyleSheet, or Tamagui.
- **Countdown**: a `useCountdown(expiresAt)` hook (server time + measured clock offset) renders `m:ss` under the buddy's name and flips the UI when it reaches 0.
- **Dev workflow**: `expo-dev-client` development builds (Expo Go can't do push on Android any more, and the SDK 57 Expo Go build was still awaiting store approval at release). Dev-client binaries are produced by **EAS Build in the cloud** — this Linux box has neither Xcode nor the Android SDK. EAS Build for TestFlight / Play internal testing.
- **Tests**: Jest + React Native Testing Library for hooks/components; type-check + ESLint in CI.

### 5.2 Screens (v1)
```
Auth          Welcome → Register (email, password) → Verify code → Login / Forgot password / Reset
Signup        Level → Institution → Major → From → Goal → Topics → Hobbies → About
  (revised)   → "Willing to be a buddy?" → Register (name, @handle, email, password)
              → Verify code → Done (writes everything, offers an avatar)
              Web routes live under /start/*, outside any session guard
Tab: Feed     Global photo feed; post a photo + caption; positive-only reactions
  (new)       (§2.7). Replaced Today in the bar; the daily loop moved into Groups.
Tab: Groups   List (with a needs-review count per row) → Group: tasks with a member
  (revised)   toggle, add task with a time estimate, start/abandon with a clock,
              review section, Buddy + verifier pickers, members, invite by @handle
              *or* by link (§2.3), chat. Join links land at /join/:token.
Tab: Buddies  Directory (cards: level · major, institution · country, goal, topic/hobby
  (revised)   chips, active status, stats) with Recommended/Points sort and filters;
              Request on the card expands in place into an optional message
              → Buddy profile (full) → Send request → pinned card with 5:00 countdown
              → Incoming request banner (Accept / Decline) for recipients
Tab: Board    Leaderboard weekly / all-time, my rank, badges strip
Tab: Profile  The same ProfileView a prospective buddy reads — study, where you're from,
  (revised)   bio, goals, topics, hobbies, track record, badges — plus Edit profile
              (/profile/edit, which is also the only way an account predating the
              student profile can fill one in), avatar, availability toggle,
              settings, change password, sign out, delete account
```

### 5.3 App repo layout
```
apps/mobile/
  app.json / eas.json
  app/                       Expo Router routes
    (auth)/                  welcome, register, verify, login, forgot, reset
    (onboarding)/            profile, goal, occupation, buddy-toggle, buddy-profile
    (tabs)/                  today, groups, buddies, board, profile
    groups/[id]/             index, chat, invite
    buddies/[handle].tsx
    tasks/[id].tsx
  src/
    api/                     client.ts (hc + auth), queries/ (TanStack hooks per resource)
    auth/                    session store, secure storage
    chat/                    socket hook
    push/                    registration + deep-link handling
    components/              design-system kit
    hooks/                   useCountdown, useNow, ...
    theme/
  __tests__/
```

---

## 5.4 Web client (Next.js on Cloudflare) — added after Phase 6

A browser front end at parity with the Expo app: the same 21 screens, the
same flows, the same palette. It is a second client onto the *same* Worker,
not a second backend — `apps/api` was not changed to accommodate it.

**Stack.** Next 16 App Router, every screen a client component, Tailwind 3.4
(not NativeWind, and not Tailwind 4 — the workspace pin holds), TanStack Query
and Zustand exactly as on mobile, deployed as a Worker by
`@opennextjs/cloudflare`. Static export was considered and rejected: it cannot
serve `/buddies/[handle]` or `/groups/[id]/chat` without either
`generateStaticParams` over unknown ids or collapsing them into query
parameters, and both break screen parity.

**Code sharing: copied, not extracted.** `src/api/*`, `useCountdown`,
`activity`, the onboarding draft and the chat socket are *byte-identical*
copies of their `apps/mobile` counterparts — 11 files. Extracting them into a
`packages/client` would have meant refactoring a shipped app with a passing
test suite that nobody asked to touch. The copies cannot silently drift
against the API, because both compile through `hc<AppType>()`: a changed route
shape is a type error in both front ends. They *can* drift from each other,
which is the accepted cost, and the reason the ported files keep mobile's prop
names (`onChangeText`) and comments — so a diff between the two trees stays
readable.

**Where the platform forced a real difference:**

| Concern | Mobile | Web | Why |
| --- | --- | --- | --- |
| Tokens | `expo-secure-store` (Keychain) | `localStorage` | A cookie is impossible: the API sends `Access-Control-Allow-Origin: *`, which the fetch spec forbids combining with credentialed requests. An XSS on this origin could read the tokens, so the CSP below is the mitigation for that specific hole; the 15-minute access TTL limits the window. |
| Query client | Module singleton | Factory, one per mount | One process per user makes a singleton safe on a phone. A Worker isolate serves many users' requests, where it would be a cross-request cache. |
| Avatars | `expo-image` | `<img crossOrigin>` | **Load-bearing.** `secureHeaders()` puts `Cross-Origin-Resource-Policy: same-origin` on `/api/media/*`; a plain cross-origin `<img>` is a `no-cors` request and CORP refuses it, so every avatar would fail on web while working in the app, which never applies CORP. `crossOrigin` makes it a CORS request, which CORP does not police and the route's existing `ACAO: *` satisfies. The alternative was weakening CORP in the API. |
| Avatar upload | `expo-image-picker` (crops, re-encodes) | `<input type="file">` + canvas | The picker was doing the 1:1 crop and quality reduction. The server caps uploads at 5 MB and a phone camera clears that, so the resize had to be reimplemented, not dropped. |
| Push | `expo-notifications` | none | A browser cannot receive Expo push. The app sits permanently on the fallback mobile already has for denied permissions: the 15-second poll in `useIncomingRequests`. |
| Refresh | `RefreshControl` | explicit button + `refetchOnWindowFocus` | Pull-to-refresh is the browser's own gesture on touch and absent on desktop. |
| Infinite lists | `onEndReached` | `IntersectionObserver` sentinel | Fires off the main thread, no scroll throttling; `rootMargin` plays the part of `onEndReachedThreshold`. |
| Inverted chat | `<FlatList inverted>` | `flex-col-reverse` | Same effect on a DOM column, so the newest-first API order is used as-is. Needs `min-h-0` inside `h-dvh` or the flex child never scrolls. |
| Destructive confirm | `Alert.alert` | `ConfirmSheet` | `window.confirm` cannot mark which choice is destructive and is browser-suppressible — wrong for account deletion. |
| Back | native stack / hardware button | `BackLink` | These URLs can be opened cold with no history, so it falls back to the parent route rather than `router.back()` into nothing. |

**Routing.** Onboarding sits under a real `/onboarding/*` segment. Next strips
route groups from the URL just as Expo Router does, so `(onboarding)/profile`
and `(tabs)/profile` would both have resolved to `/profile` and failed the
build. Guards are a web addition (`RequireSession`, `RedirectIfSignedIn`,
`LandingRedirect`): the Expo app has one entry route that picks a stack, whereas
every web screen has a URL that can be typed, bookmarked or shared. Only
`RequireSession` withholds anything — the other two render their screen and
redirect a session away from it, because the auth screens are public and gating
them put the whole first paint behind hydration (see §5.5).

**Security headers (`src/proxy.ts`).** Added because the app shipped without
any, which matters here specifically: tokens in `localStorage` made "an XSS on
this origin reads a session" a real and unmitigated path.

The CSP uses a **per-request nonce**, not `'unsafe-inline'`. The built HTML
carries four inline scripts — Next's flight-data pushes — so a policy has to
account for them somehow, and `'unsafe-inline'` would permit exactly the
injected inline script being defended against. Next stamps the nonce onto its
script tags (all 15 of them) after reading it from the request's CSP header;
`'strict-dynamic'` lets those trusted scripts pull the rest of the chunk graph.
The header and body nonces must match within a response or every script is
blocked, which is worth asserting rather than assuming.

Nonces normally cost static prerendering. That was free when the CSP was added,
because every route was a client component behind a session guard and the HTML
was a spinner regardless. It is no longer free — `/`, `/welcome`, `/login` and
`/register` now render real markup (§5.5), and a per-request nonce means that
markup cannot sit in an edge cache. The tradeoff still favours the nonce: what
those routes bought was first contentful paint, which does not depend on where
the HTML is rendered, and rendering per request costs a Worker invocation
measured at ~44 ms TTFB. If that HTML ever needs to be cacheable, the escape
route is hashing the four inline scripts instead of nonce-ing them — harder to
maintain, because their content varies per route and per build.

`connect-src` and `img-src` are **derived from `NEXT_PUBLIC_API_URL`**, and the
WebSocket origin from it the same way `chat/useChatSocket.ts` derives it — so a
local build names `localhost:8787` instead of shipping a policy that blocks it.
This is the part that takes the whole app down when it is wrong, which is why it
is computed rather than typed twice.

`style-src` keeps `'unsafe-inline'` on purpose: Next inlines critical CSS and
offers no nonce plumbing for style tags. An injected `<style>` is defacement,
not token theft — a different risk from `script-src`, so a different call.

**One dependency to watch.** The file is `proxy.ts` because Next 16 deprecates
`middleware.ts`, and a Next 16 proxy *always* runs on the Node runtime —
`export const runtime = 'edge'` is a build error. `@opennextjs/cloudflare`
labels its Node-middleware support experimental and unmaintained, so these
headers ride on that path. It is verified working end to end, but an OpenNext
upgrade is the moment to re-check that the headers are still served — a smoke
assertion in CI would be the cheap way to stop that regressing silently.

**Consequence worth knowing.** The Worker cannot know who is asking — the
session is in `localStorage` — so every *authenticated* screen still ships as a
loading spinner and hydrates into content. That matches the mobile app's own
cold start (`ActivityIndicator`, then a redirect). The public screens no longer
work that way; see §5.5.

---

## 5.5 Web client performance

The first version of this client took **2.1 s to show content on a throttled
phone** (slow 4G, 4x CPU) and 6.5 s on 3G, while first contentful paint was
~200 ms. The gap was all client-side: nothing rendered until ~800 KiB of
JavaScript had downloaded, parsed and hydrated. The API was never the problem —
measured TTFB 44 ms, `/api/me` 11-105 ms, three parallel task queries 137 ms.

Four fixes, each measured rather than assumed:

**1. `@buddy/shared` is marked `sideEffects: false`.** The barrel re-exports
`./schemas`, which imports zod. Seventeen files in the web client import that
barrel and sixteen want only plain constants. Without the annotation a bundler
must assume evaluating `./schemas` matters, so **zod shipped on every route's
critical path** — 306 KiB to support one `handleSchema.safeParse` call on the
group screen. Proved by experiment: deleting that one call did not shrink the
bundle at all; only the missing annotation was holding zod there. The package is
pure declarations, so the annotation is truthful rather than convenient.
Critical path 804 -> 631 KiB; slow 4G 2118 -> 1542 ms.

**2. The public screens render on the server.** `RequireAnon` returned a spinner
while `status === 'loading'`, and since that is also the state the server
prerenders in, the HTML for `/welcome`, `/login` and `/register` *was* a spinner.
It was also pointless: those screens are public, so there was nothing to
withhold. It is now `RedirectIfSignedIn`, which renders nothing, sits beside the
children and only redirects a session away. `WelcomeScreen` went further and
became a real server component using `next/link`, so its buttons work before any
JavaScript runs.

**3. `/` renders the landing screen instead of redirecting to it.** It used to
load the whole bundle, read the session, and only then navigate — a wasted load
cycle worth ~500 ms. `LandingRedirect` keeps the signed-in decision (`/today`,
or `/onboarding/profile`) and takes the screen over only once it knows there is
a session, so a signed-in user never sees a flash of "Create an account".

**4. The persisted query cache actually serves the first paint.** It did not
before: `startCachePersistence` ran in an effect and `persistQueryClient`
restores asynchronously, so queries mounted and fetched before the restore
landed and a returning user waited on `/me` for data already in `localStorage`.
Now `PersistQueryClientProvider` supplies the options. Worth knowing *how* that
works, because it is not a render gate: it renders children immediately and sets
`IsRestoringProvider`, and `useBaseQuery` computes
`shouldSubscribe = !isRestoring && subscribed` while `queryObserver` forces
`fetchStatus: 'idle'`. No observer subscribes, so no `queryFn` runs, until the
read settles — the fetch is gated, not the paint, which avoids a blank frame.

Plus a `preconnect` to the API origin, with `crossOrigin` because the app's calls
there carry an `Authorization` header and are therefore CORS requests — a socket
opened without it cannot be reused for one.

What is left is close to the floor for this stack: React and react-dom are
223 KiB of the remaining 631 KiB and the Next runtime another 265 KiB. Going
materially lower means a different framework, not tuning.

---

## 5.6 Notifications on the web

The web client receives **all ten notification types** the app receives, through
Web Push, with no tab open. §4.6 covers the server half; this is what runs in
the browser.

- **`public/sw.js`** — a service worker doing nothing but `push` and
  `notificationclick`. No caching (a cache here would serve stale HTML after a
  deploy) and no API calls, because session tokens live in `localStorage`, which
  a service worker cannot read.
- **`src/push/subscription.ts`** — registers the worker, fetches the server's
  VAPID public key from `/api/me/web-push/key` rather than compiling it into the
  bundle (a subscription is bound to the key that created it, so a stale copy
  would produce subscriptions nothing can push to), subscribes, and posts the
  result to `/api/me/web-push`.
- **The Profile switch** owns both the permission and the wish, which stay
  separate: a permission granted months ago with the feature since switched off
  reads as off.

Three things that would otherwise be silent failures:

- **`worker-src 'self'` in the CSP.** `worker-src` falls back to `script-src`,
  where `'strict-dynamic'` nullifies `'self'`, and a worker script cannot carry
  a nonce. Without the directive, registration is blocked in production only.
- **The payload's `url` is an Expo Router path** (`/(tabs)/today`). Next has the
  same route groups but strips them from URLs, so the worker removes the
  parenthesised segments before navigating. One payload, both clients.
- **`pushsubscriptionchange` is handled by the page**, not the worker, for the
  same `localStorage` reason: every load re-posts `getSubscription()`, and the
  endpoint upserts on the endpoint.

**iOS.** Safari offers push only to a site added to the Home Screen, which is
why there is a `manifest.webmanifest` with `display: standalone`. In a normal
iOS tab `window.Notification` does not exist at all, so the app reports the
feature as unsupported and says how to fix it.

**The fallback stays.** `useRequestNotifications` still turns new rows from the
15-second `useIncomingRequests` poll into a Notifications API banner, for
browsers where the subscription fails and for iOS before installation. A buddy
request expires in five minutes, so it is the one notification worth a second
delivery path. It stands down — along with its hidden-tab refetch — as soon as
this tab knows a push subscription is live, and does nothing while that is still
unknown, so one request never raises two banners. Its own quirks are unchanged
and still handled: the first payload is adopted as a baseline so a request
already pending does not fire a stale banner; it only fires when the user is not
looking (`visibilityState` *and* `document.hasFocus()`, since a visible tab in a
background window is the ordinary case); and it drives its own refetch while
hidden, because TanStack Query skips interval refetches for a hidden tab and the
two ticks therefore tile the states exactly rather than overlapping.

---

## 5.7 The landing page — added 2026-09-02

`/` is the only route outside the phone column, and the only one written for
somebody who has never heard of Buddy. It was reshaped against the structure a
mature product in this space uses — unibuddy.com was the reference — because
that structure is well tested: a nav that lets you skip, a hero with a figure
strip under it, four alternating product sections, a proof band, a closing call
to action, a real footer. The skeleton transferred. The contents could not, and
the gap between those two is the whole of this section.

**What was taken.** Section anchors in the sticky bar (plain `#` links — the
page stays a server component, so a burger menu below `md` would have meant
shipping JS to open a list of four links, and the links are simply hidden
there instead). A four-item strip under the hero. A fourth product section, on
groups, chat and the daily status, which had been three lines in "the details
we argued about" and is a third of what the product is. A question block. A
multi-column footer.

**What was not, and why.** The reference page's proof is a logo wall, seven
named testimonials, three institutional yield figures and a "65% of students
said…" statistic. Buddy has no customers, no institutions and no cohort to
survey. Every one of those would have to be invented, and a landing page that
opens with a fabricated number has told you what it is on the first screen. So:

- The figure strip under the hero holds *product* facts, not adoption ones —
  badge and ladder counts, the buddy-request window, the number of education
  levels, and a zero for downloads.
- The proof band is "Who it is for", built from `GOALS` and `EDUCATION_LEVELS`.
  It answers the question a logo wall answers — *is this for someone like me* —
  from the option lists signup actually offers.
- There are no per-section "Learn more" links. They point at product pages this
  app does not have.
- The footer is three columns of routes that exist, not seven columns
  containing `/about`, `/pricing`, `/careers` and `/privacy`.

**Every number is read, not typed.** The page imports `BADGES`,
`BADGE_FAMILIES`, `BUDDY_REQUEST_TTL_MS`, `CREDITS_PER_RATING_POINT`,
`DAILY_COMPLETION_BONUS`, `ABANDON_PENALTY`, `INVITE_LINK_MAX_USES`,
`MIN_TASK_MINUTES`, `MAX_TASK_MINUTES`, `MAX_RATING`, `EDUCATION_LEVELS`,
`GOALS`, `STATUSES` and `REACTIONS` from `packages/shared`. Rebalance the
economy in §2.5 and the pitch follows on the next build. This is what stops the
marketing copy becoming the one place in the repo where the rules are wrong,
and it is why the constraint above is enforceable rather than a good intention.

**Both calls to action go to `/start/level`** — `SIGNUP_STEPS[0]`, held in one
`START` constant — because the web app is where Buddy runs today. The closing
panel and the footer both say the phone apps are still coming, rather than
putting two dead store badges on the page.

---

## 6. Monorepo layout
```
FindBuddy/
  ARCHITECTURE.md
  package.json               npm workspaces; scripts: dev:api, dev:mobile, dev:web, typecheck, lint, test
  apps/
    api/                     Cloudflare Worker
    mobile/                  Expo app
    web/                     Next.js app (Cloudflare Worker via OpenNext)
  packages/
    shared/                  zod schemas, API types, constants:
                               goals.ts, occupations.ts, credits.ts, badges.ts, limits.ts
```

---

## 7. Build plan (after you confirm)

| Phase | Deliverable |
|---|---|
| 0 ✅ | Monorepo scaffold, `packages/shared`, wrangler config, D1 schema + migration `0000_init`, Cloudflare D1 + KV + R2 created (all three provisioned 2026-08-27, see §4.1), Expo app skeleton with Expo Router + NativeWind + typed Hono RPC client + secure session store. **Done 2026-08-27** — all exit criteria verified: `npm run typecheck` clean, `npm test` 52 passing (7 API in workerd against real D1, 12 app, 33 shared), `expo-doctor` 21/21, Metro export bundles 1,657 modules, `wrangler deploy --dry-run` resolves every binding. |
| 1 ✅ | Auth (register / verify email / login / refresh / reset), profile + onboarding (goal, occupation, buddy profile), avatar upload. **Done 2026-08-27.** |
| 2 ✅ | Buddy directory with matching + filters, buddy requests with 5-min expiry + countdown + push, groups & invites. **Done 2026-08-27.** |
| 3 ✅ | Tasks, done / proof / review, credits, streaks, badges, day-rollover cron — the core loop. **Done 2026-08-27.** |
| 4 ✅ | Chat (Durable Object + WebSocket), full push notification coverage. **Done 2026-08-28.** |
| 5 ✅ | Leaderboard, reports, admin endpoints, account deletion. **Done 2026-08-28.** |
| 6 ✅ | Polish, tests, EAS builds → TestFlight + Play internal testing. **Done 2026-08-28** — lint, CI, icons/splash, EAS profiles, README, and the API deployed to `https://buddy-api.ships.workers.dev`. TestFlight/Play submission itself needs `eas login` plus Apple/Google accounts. |

Each phase ends deployable and testable end-to-end.

### Phase 0 — deviations from this document, and why

Five things differed from what was written above once the current versions were
checked. All are settled in code; they are recorded here so the next phase
doesn't rediscover them.

| Assumed | Actual | Consequence |
|---|---|---|
| Expo SDK 54 | **SDK 57** (RN 0.86, React 19.2) | Current release. New Architecture has been mandatory since SDK 55, so `newArchEnabled` and Android's `edgeToEdgeEnabled` are no longer valid `app.json` keys — `expo-doctor` rejects them. |
| TypeScript ~5.9 | **6.0.3** | The version Expo SDK 57 expects. TypeScript 7.0.2 exists but Expo does not yet support it. Root-hoisted `@types` were not picked up automatically in the app's program under TS 6, so `apps/mobile` lists `types: ["jest"]` explicitly. |
| `@cloudflare/vitest-pool-workers` | **`@cloudflare/vitest-plugin` v1** | Renamed 2026-08-19. `cloudflareTest()` replaces `defineWorkersConfig`, and it requires vitest ≥ 4.1 — so the whole monorepo is on vitest 4 rather than mixing majors. |
| RNTL `render()` returns queries | **`render()` returns a promise** in RNTL 14 | Every render in a test must be awaited. |
| NativeWind peer range `>3.3.0` | **pinned `tailwindcss@^3.4`** | The range admits Tailwind 4.x, which NativeWind 4 does not support and npm will happily install. React is also pinned via a root `overrides` block: transitive deps ask for `^19` and npm hoists a second copy, which breaks native builds. |

Two structural decisions worth carrying forward:

- **`AppType` is stripped of its Bindings generic.** `typeof routes` carries
  `Cloudflare.Env` with it, which drags the Worker's runtime globals into the
  React Native TypeScript program, where they neither resolve nor belong. The
  API exports `Hono<BlankEnv, ExtractSchema<typeof routes>, '/'>` instead — only
  paths, methods and input/output shapes cross the package boundary, which is
  all `hc<AppType>()` needs. The app compiles against the API's emitted
  declarations (`tsconfig.build.json`), not its source.
- **NativeWind styling is not assertable in Jest.** Class-to-style compilation
  happens in the Metro transform, which `jest-expo` does not run, so under Jest
  `className` passes through untouched. Component tests assert the class strings
  they build; the real pipeline is covered by `npm run export`.

---

## 8. Prerequisites on your side
1. **Running the app.** This dev machine is a **Linux container** (Node 22, no Xcode, no Android SDK), so simulators/emulators can't run here. Two options, both fine:
   - **A dev-client build on your own phone** (built by EAS in the cloud) — Metro runs here, you scan the QR code. Simplest for daily work. Plain Expo Go is not sufficient: it can't do Android push, and the SDK 57 Expo Go release was still pending store approval.
   - **Your own Mac** (**Xcode 16+** for the iOS Simulator) and/or **Android Studio** for an emulator. iOS *binaries* for TestFlight can also be produced by **EAS Build** in the cloud without a Mac.
   Everything server-side (Worker, D1, Durable Objects, KV, queues, crons) runs and is tested locally here via workerd/Miniflare.
2. **Apple Developer Program** (TestFlight, APNs key) and **Google Play Console** ($25 one-time) — needed by Phase 6, not for local development.
3. **Firebase project** (free) just to obtain FCM credentials for Android push (Phase 4).
4. **Expo account** (free) for EAS Build / push.
5. **Cloudflare**: Workers Paid plan ✅ confirmed; API token with write access ✅ verified; D1/KV/R2 ✅ created. Sender domain for Email Sending: **`no-reply@localrack.xyz`** (decided 2026-08-27; domain onboarded to Email Service with SPF + DKIM and verified sending **2026-08-28**) — the binding is wired in Phase 1.
6. Tools: `wrangler` 4.127 ✅ already installed. `eas-cli` and Watchman are installed later, when Phase 6 (EAS builds) needs them.

---

## 9. Decisions — all resolved

Every item below is settled; where a decision was made during implementation
rather than up front, the date and the reason are recorded.
- [x] Buddy request expiry **5 min**, re-request cooldown **1 h** — as proposed; both are constants in `packages/shared/src/limits.ts`
- [x] Push via **Expo Push Service** — as proposed. The queue consumer is the only code that knows, so switching to direct APNs/FCM later stays contained to `services/push.ts`.
- [x] Reviewer rule in 3+ member groups: **any member, first review wins** — decided 2026-08-27
- [x] Credit formula: **`rating × 10` + `20` daily-completion bonus** — decided 2026-08-27; the bonus is awarded at approval time, not at rollover, because a task may legitimately be approved after its day has ended
- [x] Reports: **manual admin review only** — decided 2026-08-28. Auto-hide after N reports is trivially weaponised by a small group against one person, and at this scale a queue does everything a threshold would. `status` stays in the schema so it can be layered on later without a migration.
- [x] Per-group leaderboard: **not in v1** — decided 2026-08-28. A 2-person matched group makes it a coin flip, which is demotivating rather than motivating; global weekly + all-time ship first.
- [x] Chat history in **D1** — decided 2026-08-28; the DO does live fan-out only, so reports can query messages across groups
- [x] UI styling: **NativeWind v4**, with `tailwindcss` pinned to ^3.4 — see the Phase 0 deviations table for why the pin is load-bearing
- [x] Photo proofs: **text only in v1** — as proposed. `proof_image_key` exists in the schema and the API accepts it, but no UI sets it; group-private images would also need an authenticated media path, unlike avatars.
- [x] Goal / occupation lists: **shipped as proposed**. They live in `packages/shared/src/{goals,occupations}.ts` and adding an entry needs no other change.
- [x] App name **"Buddy"**, slug `buddy`, bundle/package id **`com.buddyapp.buddy`** (iOS `bundleIdentifier` + Android `package`) — decided 2026-08-27
- [x] Sender domain for verification/reset emails: **`no-reply@localrack.xyz`** — decided 2026-08-27
