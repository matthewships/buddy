# Buddy

Accountability buddies. Plan what you'll finish today, have a buddy approve it,
build the streak.

Design and decisions: [ARCHITECTURE.md](./ARCHITECTURE.md). Every non-obvious
choice is recorded there, including where the implementation deviates from the
original plan and why.

## Layout

```
apps/api       Cloudflare Worker — Hono, D1 + Drizzle, Durable Object chat,
               Queues for push, cron triggers
apps/mobile    Expo SDK 57 app — Expo Router, NativeWind, TanStack Query
apps/web       Next 16 app — App Router, Tailwind, TanStack Query; deployed as
               a Worker by @opennextjs/cloudflare
packages/shared  Zod schemas, goal/occupation lists, credit + badge rules
```

`packages/shared` is the single source of truth for anything all three must
agree on. Both clients compile against the Worker's own route types through
Hono's `hc<AppType>()`, so a changed response shape is a type error rather than
a runtime surprise.

`apps/web` is the same 21 screens as the app, against the same API — not a
second backend. Its data layer is a deliberate copy of the app's rather than a
shared package; `ARCHITECTURE.md` §5.4 records why, and every place the browser
forced a genuine difference (tokens in `localStorage`, no push, `crossOrigin`
on avatars).

## Running it

Requires Node ≥ 22.13 (see `.nvmrc`).

```bash
npm install

# API on http://localhost:8787
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill in JWT_SECRET
npm run dev:api

# Metro; scan the QR code with a dev-client build
npm run dev:mobile

# web client on http://localhost:3000, pointed at the local API
npm run dev:web
```

Outside production the API logs email verification codes to the console, so you
can register without a working email sender. It never does this in production.

The app needs a **dev-client build**, not Expo Go: Expo Go cannot deliver Android
push, and the SDK 57 build of Expo Go was still awaiting App Store approval.

### iOS on a Mac (no Expo or Apple account needed)

With Xcode installed, the whole loop runs locally and nothing is provisioned onto
hardware, so neither an Expo login nor an Apple Developer membership is involved:

```bash
npm install
npm run db:migrate:local --workspace @buddy/api   # seeds the local D1 file

# terminal 1 — API on :8787, logs verification codes
npm run dev:api

# terminal 2 — compiles natively and launches the Simulator (~10-15 min first run)
cd apps/mobile && npx expo run:ios
```

After the first build, `npx expo start --dev-client` relaunches in seconds
without recompiling.

`http://localhost:8787` works from the Simulator because it shares the Mac's
network, and the generated `Info.plist` sets `NSAllowsLocalNetworking: true` —
App Transport Security would otherwise block plain HTTP.

Two limits of the Simulator: it cannot receive remote push (the buddy-request
notification will not fire — the 15-second poll is the fallback, which is why it
exists, and the web client is the easier place to test a real notification), and
the review loop needs two accounts, since nobody can approve their own task.

Building for a **physical iPhone** or TestFlight needs the paid Apple Developer
Program; see `apps/mobile/EAS.md`.

## Checks

```bash
npm run lint        # eslint, flat config at the root
npm run typecheck   # tsc across all four workspaces
npm test            # 216 tests
```

The API suite runs inside `workerd` against real D1, KV and a real Durable
Object rather than mocks, so a migration or constraint that would fail in
production fails here. CI runs all of the above plus a Metro bundle and the web
Worker bundle, because a bundler resolves imports differently from `tsc` — and
the web step builds the artifact that actually ships, not just a type-checked
source tree.

One limit worth knowing: **Miniflare does not enforce every runtime restriction
the real platform does.** A PBKDF2 iteration count above 100,000 passes locally
and throws on deploy. That is why `test/password.test.ts` asserts the parameter
itself, and why the deploy step matters.

## Deploying

```bash
cd apps/api
npx wrangler d1 migrations apply buddy --remote
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_TOKEN     # without it, /admin/* is closed
npx wrangler deploy
```

Live: `https://buddy-api.ships.workers.dev`

The web client is a separate Worker and needs no secrets, no bindings and no
migrations — it only serves the bundle:

```bash
npm run deploy:web        # next build + OpenNext bundle + wrangler deploy
```

`NEXT_PUBLIC_API_URL` is inlined at build time; `next.config.ts` defaults it to
the deployed Worker for a production build and to `http://localhost:8787` for
`next dev`, so neither needs a flag in the normal case.

### Browser notifications

The web client receives the same ten notifications the app does, through Web
Push (ARCHITECTURE.md §4.6, §5.6). It needs a VAPID keypair, which the API signs
with and browsers subscribe against:

```bash
cd apps/api
node scripts/vapid-keys.mjs        # prints VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

Order matters when rolling this out to an already-deployed API: **apply the
migrations first**, then deploy, then set the secrets. Without the secrets the
web branch does nothing; with the secrets but without
`0002_add_web_push_subscriptions`, the queue consumer fails every batch — mobile
notifications included.

Rotating the keys invalidates every existing browser subscription, since each is
bound to the key that created it, and everyone has to re-enable notifications in
Profile.

For local development put both values in `apps/api/.dev.vars`. A service worker
runs on `localhost` (it counts as a secure context) and the subscription
endpoint is the browser's real push service, so the whole path can be tested
end to end without deploying. On an iPhone, Safari only offers push to a site
added to the Home Screen; everywhere else no install is needed.

## Outstanding

- **Push credentials (mobile only).** An APNs key and FCM v1 credentials need
  uploading to EAS before push works on a real device. The web client is not
  waiting on any of that: it uses Web Push directly from the Worker, which needs
  only the VAPID keypair below.
- **EAS builds** need `eas login`; profiles are configured in
  `apps/mobile/eas.json`.
- **`apps/web` has no test suite.** Every other workspace has one, and
  `npm test` skips web silently because it has no `test` script. The web-only
  logic worth covering is the canvas avatar resize, the infinite-scroll
  sentinel, and a regression test for the `Button` width override — a bug that
  neither `tsc` nor a successful build can catch, since every route serves a
  spinner until the client hydrates.
- **No automated deploy.** Both Workers ship by hand (`npm run deploy:web`,
  `wrangler deploy` in `apps/api`). CI builds the web Worker bundle but does not
  publish it.
- **Both Workers are on `*.ships.workers.dev`.** Fine for now; a custom domain
  is a DNS record and a `routes` entry in each `wrangler.jsonc`.

- **The web CSP rides on an experimental path.** Next 16 proxies always run on
  the Node runtime, and `@opennextjs/cloudflare` calls its Node-middleware
  support experimental and unmaintained. The headers are verified working, but
  an OpenNext upgrade is the moment to confirm they are still being sent —
  ideally with a CI assertion, since a silent loss of headers would not fail a
  build. See ARCHITECTURE.md §5.4.

Resolved 2026-08-28: `localrack.xyz` is onboarded to Cloudflare Email Service
(SPF + DKIM), so verification and reset codes send in production. The web client
sends a nonce-based CSP plus HSTS, frame-denial, nosniff, referrer and
permissions policies (`apps/web/src/proxy.ts`).
