# Build profiles

`eas.json` defines three profiles. All of them set `EXPO_PUBLIC_API_URL`, which
`src/auth/session.ts` reads before falling back to `app.json`'s `extra.apiUrl`.

| Profile | Points at | For |
|---|---|---|
| `development` | the deployed Worker | a dev-client build on your own phone |
| `preview` | the deployed Worker | internal testers |
| `production` | the deployed Worker | TestFlight / Play |

**Why `development` does not use `localhost:8787`:** the dev build runs on a
physical phone while Metro runs on this machine. `localhost` on the phone is the
phone, so a build pointed there cannot reach the API at all — the app loads and
every request fails. Pointing it at the deployed Worker means a dev build works
the moment it is installed.

To develop against a *local* API instead, the Worker has to be publicly
reachable too. Run `npx wrangler dev` and expose it (a tunnel, or
`wrangler dev --remote`), then start Metro with the URL overridden:

```bash
EXPO_PUBLIC_API_URL="https://your-tunnel-url" npx expo start --dev-client
```

Metro's own `--tunnel` flag only tunnels the JavaScript bundle, not your API.

## Logging in from this machine (headless)

`eas login` defaults to a browser OAuth flow that redirects to
`http://localhost:<random-port>/auth/callback`. That listener runs **on this
machine**, so when you are SSH'd in from a laptop the browser opens locally, the
callback never reaches the devbox, and the CLI waits forever. Pasting the code
into the terminal does nothing — nothing is reading stdin.

Two ways round it:

```bash
# Interactive: username + password prompt, no browser involved.
npm run eas --workspace @buddy/mobile -- login --no-browser
```

```bash
# Non-interactive, and what CI uses. Create a token at
# https://expo.dev/settings/access-tokens
export EXPO_TOKEN="..."          # eas-cli reads this before any stored session
npm run eas --workspace @buddy/mobile -- whoami
```

`eas-cli` is a pinned devDependency, so `npm run eas` uses the local copy
instead of re-downloading it (and re-printing a wall of deprecation warnings)
on every invocation.
