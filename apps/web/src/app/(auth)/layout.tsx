import { AppFrame, RequireAnon } from '@/components';

/**
 * The auth stack. `RequireAnon` is the web addition: on a phone there is no way
 * to reach /login while signed in, but a bookmark or a shared link can land here
 * with a live session, and re-asking for a password would be wrong.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <RequireAnon>{children}</RequireAnon>
    </AppFrame>
  );
}
