import { WelcomeScreen } from '@/components';

/**
 * Kept as a route even though `/` now serves the same screen: `RequireSession`
 * sends a signed-out user to /welcome, and that redirect target should not
 * depend on the entry route's own guard.
 *
 * The content lives in `WelcomeScreen` so the two routes cannot drift, and this
 * page is a server component — the frame comes from the (auth) layout.
 */
export default function Welcome() {
  return <WelcomeScreen />;
}
