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
| Builds / deploy | Expo **EAS Build** for app binaries; Wrangler + GitHub → Workers Builds for the API; Vitest (`@cloudflare/vitest-pool-workers`) + Jest/RNTL | |

Backend cost: Workers **Paid plan ($5/mo)** covers everything at early scale. Expo EAS has a free tier for builds.

### Considered and rejected
- **Native SwiftUI**: best iOS polish, but you now want Android too → Expo wins.
- **Sign in with Apple / Google**: not needed for email+password; App Store only requires Sign in with Apple if you offer *other* social logins. Can be added later.
- **Storing chat messages inside the Durable Object's SQLite**: fast, but moderation/reports can't query across groups. v1 keeps **D1 as the single source of truth**; the DO only does live fan-out. `[DECISION]`
- **bcrypt/argon2 on Workers**: need WASM and are CPU-heavy; PBKDF2 is native in WebCrypto and OWASP-approved at 600k iterations.

---

## 2. Product rules (please correct anything wrong)

### 2.1 Registration & profile
Every new user goes through:
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
- Default sort: **same goal first, then same occupation, then most recently active**. Filters: goal, occupation, "active in the last 15 min".
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
A user creates a group and invites people they already know by `@handle` (or a share link). Any number of members. Group invites don't expire in 5 minutes (they're for friends), they stay pending for 7 days. Every group gets a chat room.

### 2.4 Daily tasks & the review loop
- Each member writes the tasks they plan to finish **today** (their local day). Tasks not completed by local midnight become **missed**.
- Owner marks a task **Done**, optionally attaching a text explanation (proof).
- A buddy in the group reviews it: **Approve with rating 0–5**, or **Request proof** (task goes back to owner as *proof requested*). Owner submits/updates the proof → buddy reviews again → Approve with rating (0 effectively rejects).
- **Decided 2026-08-27:** in groups with 3+ members, **any other member can review and the first review is final**. Enforced by a guarded `UPDATE ... WHERE status='done' RETURNING`, not by a status read followed by a write — two reviewers tapping simultaneously would both pass the latter.
- **Decided 2026-08-27:** a rating of **0 still approves**. It closes the task and counts toward the streak and the daily bonus; it simply earns no credits. `TASK_STATUSES` has no rejected state, and adding one would leave tasks stuck with nowhere to go.

### 2.5 Credits, streaks, badges, leaderboard
- On approval: `credits = rating × 10`; **+20 daily bonus** if every planned task of the day is approved. `[DECISION]` (constants in `packages/shared/config`)
- Streak = consecutive days with at least one approved task.
- **Badges** at credit thresholds (100 / 500 / 2,000 / 10,000) + behavioural ones (first approved task, 7-day streak, 30-day streak, "Helpful buddy" = 50 reviews given). Badge list is data, editable.
- **Leaderboard**: weekly (resets Monday 00:00 UTC) and all-time, global. `[DECISION]` add per-group leaderboard too?

### 2.6 Reports & chat
- Any member can report a proof, a chat message, or a user (reason + note). Reports go to a simple admin endpoint for you to review. `[DECISION]` auto-hide content after N reports, or manual only?
- Chat: real-time text per group, history, push when backgrounded. No typing indicators / read receipts in v1.

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
- Password policy: ≥ 8 chars, checked against a small common-password list; hashed with **PBKDF2-SHA256, 600,000 iterations, 16-byte salt** (WebCrypto).
- Codes: 6 digits, 10-minute expiry, max 5 attempts, hashed at rest.
- Rate limits: login 10/15 min per email+IP, register 5/hour per IP, code resend 3/10 min.
- Access JWT: 15 min, HS256. Refresh: 30 days, rotating, stored hashed.

### 4.4 API surface (v1, beyond auth)
```
GET/PATCH /me                      profile, goal, occupation, timezone, is_open_buddy, buddy profile
POST   /me/avatar                  → presigned R2 upload URL + key
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
- The app registers an **Expo push token** (works for both APNs and FCM). The Worker's queue consumer batches `{token, title, body, data}` and POSTs to `https://exp.host/--/api/v2/push/send`; receipts are checked and dead tokens deleted.
- Requires: an APNs key uploaded to EAS (iOS) and a Firebase project's FCM V1 credentials uploaded to EAS (Android — Google mandates FCM for Android push regardless of provider).
- `[DECISION]` Alternative with no Expo server in the path: the Worker talks to APNs (HTTP/2, ES256 token) and FCM HTTP v1 (Google service account) directly. ~2× the integration code, two token types, no third party. My recommendation: Expo Push for v1; the queue-consumer interface is the same so switching later is contained.

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
Onboarding    Name & @handle & avatar → Goal (chips + custom) → Occupation (chips + custom)
              → "Willing to be a buddy?" → Buddy profile (headline, about, availability) → Done
Tab: Today    Today's tasks across my groups; add task; mark done (+proof); buddies' tasks; review actions
Tab: Groups   List → Group (members, tasks by day, chat) → Invite by @handle / share link → Chat
Tab: Buddies  Directory (cards: goal, occupation, headline, active status, stats) with filters
              → Buddy profile (full) → Send request → pinned card with 5:00 countdown
              → Incoming request banner (Accept / Decline) for recipients
Tab: Board    Leaderboard weekly / all-time, my rank, badges strip
Tab: Profile  Stats, badges, streak, edit goal/occupation/buddy profile, availability toggle,
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

## 6. Monorepo layout
```
FindBuddy/
  ARCHITECTURE.md
  package.json               npm workspaces; scripts: dev:api, dev:mobile, typecheck, lint, test
  apps/
    api/                     Cloudflare Worker
    mobile/                  Expo app
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
| 6 | Polish, tests, EAS builds → TestFlight + Play internal testing |

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
5. **Cloudflare**: Workers Paid plan ✅ confirmed; API token with write access ✅ verified; D1/KV/R2 ✅ created. Sender domain for Email Sending: **`no-reply@localrack.xyz`** (decided 2026-08-27) — the binding is wired in Phase 1.
6. Tools: `wrangler` 4.127 ✅ already installed. `eas-cli` and Watchman are installed later, when Phase 6 (EAS builds) needs them.

---

## 9. Open decisions — checklist
- [ ] Buddy request expiry **5 min** (config constant) — and re-request cooldown **1 h** after decline/timeout
- [ ] Push via **Expo Push Service** (proposed) vs direct APNs + FCM from the Worker
- [x] Reviewer rule in 3+ member groups: **any member, first review wins** — decided 2026-08-27
- [x] Credit formula: **`rating × 10` + `20` daily-completion bonus** — decided 2026-08-27; the bonus is awarded at approval time, not at rollover, because a task may legitimately be approved after its day has ended
- [x] Reports: **manual admin review only** — decided 2026-08-28. Auto-hide after N reports is trivially weaponised by a small group against one person, and at this scale a queue does everything a threshold would. `status` stays in the schema so it can be layered on later without a migration.
- [x] Per-group leaderboard: **not in v1** — decided 2026-08-28. A 2-person matched group makes it a coin flip, which is demotivating rather than motivating; global weekly + all-time ship first.
- [x] Chat history in **D1** — decided 2026-08-28; the DO does live fan-out only, so reports can query messages across groups
- [ ] UI styling: NativeWind (proposed) vs StyleSheet vs Tamagui
- [ ] Photo proofs in v1? (proposal: text only; image field already in the schema)
- [ ] Goal / occupation suggestion lists in §2.1 — add or remove entries
- [x] App name **"Buddy"**, slug `buddy`, bundle/package id **`com.buddyapp.buddy`** (iOS `bundleIdentifier` + Android `package`) — decided 2026-08-27
- [x] Sender domain for verification/reset emails: **`no-reply@localrack.xyz`** — decided 2026-08-27
