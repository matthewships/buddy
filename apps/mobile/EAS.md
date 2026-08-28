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
