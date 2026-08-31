import { AppFrame, RedirectIfOnboarded } from '@/components';

/**
 * The signup questionnaire's shell.
 *
 * The distinguishing feature is what is *absent*: no `RequireSession`. Every
 * other stack in the app gates on a session, and these screens run before one
 * exists — the questions come first and registration comes last, so a visitor
 * with no account has to be able to walk the whole flow.
 *
 * That is not the same as being ungated. A signed-in user who has already
 * finished onboarding has no business here and is sent to the app;
 * `RedirectIfOnboarded` does only that, and lets a signed-in but *unonboarded*
 * user through, since these are the screens that would finish the job.
 */
export default function IntroLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <RedirectIfOnboarded />
      {children}
    </AppFrame>
  );
}
