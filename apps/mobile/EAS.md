# Build profiles

`eas.json` defines three profiles. All of them set `EXPO_PUBLIC_API_URL`, which
`src/auth/session.ts` reads before falling back to `app.json`'s `extra.apiUrl`.

| Profile | Points at | For |
|---|---|---|
| `simulator` | the deployed Worker | iOS Simulator on a Mac — **no Apple Developer account needed** |
| `development` | the deployed Worker | a dev-client build on a physical device |
| `preview` | the deployed Worker | internal testers |
| `production` | the deployed Worker | TestFlight / Play |

## iOS: which profile, and what it costs

Apple's provisioning rules, not Expo's, decide this:

- **`simulator`** (`ios.simulator: true`) builds an unsigned app that runs only
  in the iOS Simulator. Nothing is provisioned onto hardware, so **no Apple
  Developer Program membership is required.** It does need a Mac with Xcode.
- **`development`** installs on a real iPhone, which means a provisioning profile
  and a registered device — that requires the **paid Apple Developer Program**
  ($99/yr). There is no free route onto your own iPhone here.
- **Expo Go is not an option on iOS right now.** The SDK 57 build of Expo Go was
  still awaiting App Store approval; `eas go` sideloads it through TestFlight,
  which itself needs a paid account. So Expo Go saves nothing.

### Running the simulator build from this machine

The simulator runs on your Mac while Metro runs here, so the JS bundle has to be
tunnelled — a LAN URL will not reach a remote container:

```bash
npm run start:tunnel        # expo start --dev-client --tunnel
```

`@expo/ngrok` is a devDependency for this reason: `--tunnel` otherwise tries to
install it into the global npm prefix, which is not writable on this machine.

**No `channel` on any profile, deliberately.** Channels route EAS Update, which
requires `expo-updates`; that isn't installed and over-the-air updates are not
part of this build. Adding a channel without it produces a build that either
warns or fails for no benefit. If OTA updates are wanted later: install
`expo-updates`, run `eas update:configure`, then add the channels back.

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
eas login --no-browser
```

```bash
# Non-interactive, and what CI uses. Create a token at
# https://expo.dev/settings/access-tokens
export EXPO_TOKEN="..."          # eas-cli reads this before any stored session
eas whoami
```

## Where eas-cli lives

Installed **globally**, not as a project dependency — `expo-doctor` fails the
project if `eas-cli` is in `package.json`, and `eas init` warns about it too. The
version is pinned instead through `cli.version` in `eas.json`, which is Expo's
sanctioned mechanism and applies to whichever CLI runs the build.

On this machine the global prefix is `~/.npm-global` (the default `/usr` is not
writable), so `~/.npm-global/bin` needs to be on `PATH`:

```bash
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
eas --version
```
