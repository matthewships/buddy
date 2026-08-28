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
packages/shared  Zod schemas, goal/occupation lists, credit + badge rules
```

`packages/shared` is the single source of truth for anything both sides must
agree on. The app compiles against the Worker's own route types through Hono's
`hc<AppType>()`, so a changed response shape is a type error rather than a
runtime surprise.

## Running it

Requires Node ≥ 22.13 (see `.nvmrc`).

```bash
npm install

# API on http://localhost:8787
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then fill in JWT_SECRET
npm run dev:api

# Metro; scan the QR code with a dev-client build
npm run dev:mobile
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
exists), and the review loop needs two accounts, since nobody can approve their
own task.

Building for a **physical iPhone** or TestFlight needs the paid Apple Developer
Program; see `apps/mobile/EAS.md`.

## Checks

```bash
npm run lint        # eslint, flat config at the root
npm run typecheck   # tsc across all three workspaces
npm test            # 165 tests
```

The API suite runs inside `workerd` against real D1, KV and a real Durable
Object rather than mocks, so a migration or constraint that would fail in
production fails here. CI runs all of the above plus a Metro bundle, because
Metro resolves imports differently from `tsc`.

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

## Outstanding

- **Email delivery.** `localrack.xyz` still needs onboarding to Cloudflare Email
  Service (SPF + DKIM) before verification codes actually send. Until then the
  send fails and is logged, so production registration cannot complete.
- **Push credentials.** An APNs key and FCM v1 credentials need uploading to EAS
  before push works on a real device.
- **EAS builds** need `eas login`; profiles are configured in
  `apps/mobile/eas.json`.
