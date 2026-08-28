import { AppFrame, RedirectIfSignedIn } from '@/components';

/**
 * The auth stack. `RedirectIfSignedIn` is the web addition: on a phone there is
 * no way to reach /login while signed in, but a bookmark or a shared link can
 * land here with a live session, and re-asking for a password would be wrong.
 *
 * It sits *beside* the children rather than wrapping them. These are the only
 * screens an unauthenticated visitor ever sees, so they must be in the
 * prerendered HTML; a guard that withheld them until the session had been read
 * out of `localStorage` put the whole auth stack behind hydration. Nothing here
 * is privileged, so there is nothing to withhold — see SessionGate.tsx.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <RedirectIfSignedIn />
      {children}
    </AppFrame>
  );
}
