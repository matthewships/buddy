import { create } from 'zustand';

/**
 * Onboarding is several screens that add up to one PATCH /me (§5.2). Holding the
 * answers here rather than passing them through route params keeps the final
 * write atomic — the profile is never half-saved if the user abandons midway —
 * and lets the user go back without losing what they typed.
 */
interface OnboardingDraft {
  displayName: string;
  handle: string;
  timezone: string;
  /**
   * The picked goals, in the order they were chosen, capped at MAX_GOALS. An
   * ordered array rather than two fields because the first pick is the primary
   * goal and deselecting it should promote the second, which a pair of
   * independent slots makes awkward.
   */
  goalKeys: string[];
  goalText: string;
  occupationKey: string | null;
  occupationText: string;
  isOpenBuddy: boolean;
  headline: string;
  about: string;
  availability: string;
  set: (patch: Partial<DraftValues>) => void;
  reset: () => void;
}

type DraftValues = Omit<OnboardingDraft, 'set' | 'reset'>;

const initial: DraftValues = {
  displayName: '',
  handle: '',
  // Detected once, here, rather than asked for: the device already knows.
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  goalKeys: [],
  goalText: '',
  occupationKey: null,
  occupationText: '',
  isOpenBuddy: true,
  headline: '',
  about: '',
  availability: '',
};

export const useDraft = create<OnboardingDraft>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));

/**
 * Turns the draft into the PATCH /me body. Empty optional strings become
 * undefined so they are omitted rather than stored as "".
 */
export function draftToPatch(draft: DraftValues): Record<string, unknown> {
  const optional = (value: string) => (value.trim().length > 0 ? value.trim() : undefined);

  return {
    displayName: optional(draft.displayName),
    handle: draft.handle.trim().toLowerCase(),
    timezone: draft.timezone,
    goalKey: draft.goalKeys[0] ?? null,
    // Explicitly null rather than omitted, so clearing the second goal on a
    // later edit actually clears it instead of leaving the old value stored.
    goalKey2: draft.goalKeys[1] ?? null,
    goalText: optional(draft.goalText),
    occupationKey: draft.occupationKey,
    occupationText: optional(draft.occupationText),
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
