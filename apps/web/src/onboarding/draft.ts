import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The signup questionnaire's answers, held here until there is an account to
 * write them to.
 *
 * Two things make this more than a convenience. The questions now come *before*
 * registration — nothing is asked twice, and nobody is asked to commit to an
 * account before seeing what the product is for — so for most of the flow there
 * is no server to save to. And the answers have to survive the trip to a mail
 * client and back for the verification code, which on mobile Safari can mean
 * the tab is discarded and restored.
 *
 * Hence `sessionStorage`: it survives a reload and a restored tab, and it is
 * gone when the tab closes, which is the right lifetime for a half-finished
 * signup. `localStorage` would leave a stranger's answers waiting on a shared
 * computer. Everything is written in one `PATCH /me` at the end, so an
 * abandoned signup leaves no half-saved profile behind.
 */
interface DraftValues {
  displayName: string;
  handle: string;
  timezone: string;
  /** Student profile (§2.1). */
  educationLevel: string | null;
  institution: string;
  city: string;
  majorKey: string | null;
  majorText: string;
  country: string | null;
  topics: string[];
  interests: string[];
  /** What `custom` means, when `Other` is one of the interests. */
  interestText: string;
  bio: string;
  /**
   * The picked goals, in the order they were chosen, and no longer capped. An
   * ordered array rather than numbered fields because the first pick is the
   * primary goal and deselecting it should promote the second, which a set of
   * independent slots makes awkward.
   */
  goalKeys: string[];
  goalText: string;
  /**
   * A group join link the visitor arrived on, carried through the whole signup.
   *
   * This is the reason the draft persists rather than merely existing: the token
   * has to survive nine question screens, registration, and a trip to a mail
   * client for the verification code. Losing it would drop someone who was
   * invited to a specific group onto a generic home screen with no way back.
   */
  inviteToken: string | null;
  isOpenBuddy: boolean;
  headline: string;
  about: string;
  availability: string;
}

interface OnboardingDraft extends DraftValues {
  set: (patch: Partial<DraftValues>) => void;
  reset: () => void;
}

const initial: DraftValues = {
  displayName: '',
  handle: '',
  // Detected once, here, rather than asked for: the device already knows.
  timezone: 'UTC',
  educationLevel: null,
  institution: '',
  city: '',
  majorKey: null,
  majorText: '',
  country: null,
  topics: [],
  interests: [],
  interestText: '',
  bio: '',
  goalKeys: [],
  goalText: '',
  inviteToken: null,
  isOpenBuddy: true,
  headline: '',
  about: '',
  availability: '',
};

/**
 * The timezone default is resolved lazily rather than in `initial`, because
 * `initial` is evaluated during the server render where `Intl` resolves to the
 * server's zone, not the user's — and that value would then hydrate as if the
 * user had answered it.
 */
function detectedTimezone(): string {
  if (typeof window === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export const useDraft = create<OnboardingDraft>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      reset: () => set({ ...initial, timezone: detectedTimezone() }),
    }),
    {
      name: 'buddy.signup.v1',
      // Bumping `name` is how a shape change is handled: a stale draft from an
      // older version of the questions is simply not found, and the user starts
      // the current ones rather than resuming a half-answered older set.
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.sessionStorage,
      ),
      // Only the answers. The actions are recreated on every load, and
      // persisting them would serialise functions to null and break the store.
      partialize: (state) => {
        const { set: _set, reset: _reset, ...values } = state;
        return values;
      },
      onRehydrateStorage: () => (state) => {
        // A resumed draft keeps whatever zone it was started in; a fresh one
        // has the placeholder, which is the moment to read the real value.
        if (state && state.timezone === 'UTC') state.set({ timezone: detectedTimezone() });
      },
    },
  ),
);

/**
 * Prerendering has no `sessionStorage`. Returning a storage that holds nothing
 * keeps `persist` on its normal path server-side — reading nothing, writing
 * nothing — instead of needing a guard at every call site.
 */
const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

/**
 * Turns the draft into the `PATCH /me` body. Empty optional strings become
 * `undefined` so they are omitted rather than stored as "", and the fields the
 * user never reached are omitted rather than sent as null — a signup that
 * skipped a question should not clear anything.
 */
export function draftToPatch(draft: DraftValues): Record<string, unknown> {
  const optional = (value: string) => (value.trim().length > 0 ? value.trim() : undefined);

  return {
    displayName: optional(draft.displayName),
    ...(draft.handle.trim() ? { handle: draft.handle.trim().toLowerCase() } : {}),
    timezone: draft.timezone,
    /**
     * The whole list. The server derives `goalKey` and `goalKey2` from its
     * first two entries, so sending those as well would be two sources for one
     * answer — and the picker is no longer capped at two.
     */
    goalKeys: draft.goalKeys,
    goalText: optional(draft.goalText),
    ...(draft.educationLevel ? { educationLevel: draft.educationLevel } : {}),
    institution: optional(draft.institution),
    city: optional(draft.city),
    ...(draft.majorKey ? { majorKey: draft.majorKey } : {}),
    majorText: optional(draft.majorText),
    ...(draft.country ? { country: draft.country } : {}),
    bio: optional(draft.bio),
    topics: draft.topics,
    interests: draft.interests,
    ...(draft.interests.includes('custom') ? { interestText: optional(draft.interestText) } : {}),
    isOpenBuddy: draft.isOpenBuddy,
    // The buddy profile only exists for users open to requests (§2.1).
    ...(draft.isOpenBuddy && {
      buddyProfile: {
        headline: optional(draft.headline),
        about: optional(draft.about),
        availability: optional(draft.availability),
      },
    }),
  };
}
