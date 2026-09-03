'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { MAX_TASK_TITLE } from '@buddy/shared';

import { useDraft } from './draft';
import { TASK_PARAM } from './steps';

/**
 * Picks up the task typed into the landing page's hero (§2.9).
 *
 * The landing page is a server component with a no-JavaScript rule, so its
 * "what will you finish today?" box is a plain `<form method="get">` — the
 * answer arrives here as `?task=` on the first step. This writes it into the
 * draft and then takes it out of the URL, so a refresh after the user has
 * edited the task on `/start/today` does not put the original back.
 *
 * Mounted in the intro layout rather than on one step, because `FIRST_STEP`
 * has moved before (§2.8) and the form should not need to know which screen
 * it lands on. Renders nothing.
 */
function Reader() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const setDraft = useDraft((d) => d.set);

  const task = params.get(TASK_PARAM);

  useEffect(() => {
    if (task === null) return;
    const title = task.trim().slice(0, MAX_TASK_TITLE);
    // An explicit new answer, so it overwrites whatever a resumed draft held.
    if (title.length > 0) setDraft({ firstTask: title });
    router.replace(pathname);
  }, [task, pathname, router, setDraft]);

  return null;
}

/**
 * `useSearchParams` suspends during prerender, so the boundary is required —
 * without it the build refuses to statically render every step.
 */
export function TaskFromQuery() {
  return (
    <Suspense fallback={null}>
      <Reader />
    </Suspense>
  );
}
