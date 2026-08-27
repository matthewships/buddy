import { create } from 'zustand';

import {
  clearTokens,
  getAccessToken,
  saveTokens,
  setSessionLostHandler,
  type Tokens,
} from './session';

/**
 * Session state (§5.1): a deliberately small Zustand store holding only who is
 * signed in and whether they have finished onboarding. Everything else —
 * profile, tasks, groups — is server data owned by TanStack Query.
 */
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionState {
  status: SessionStatus;
  /** Mirrors /me.onboarded so the router can pick a stack without a round trip. */
  onboarded: boolean;
  signIn: (tokens: Tokens, onboarded: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
  setOnboarded: (value: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  onboarded: false,

  signIn: async (tokens, onboarded) => {
    await saveTokens(tokens);
    set({ status: 'signedIn', onboarded });
  },

  signOut: async () => {
    await clearTokens();
    set({ status: 'signedOut', onboarded: false });
  },

  restore: async () => {
    const token = await getAccessToken();
    set({ status: token ? 'signedIn' : 'signedOut' });
  },

  setOnboarded: (value) => set({ onboarded: value }),
}));

/**
 * A revoked refresh family has to drop the app back to the auth stack. The
 * session module can't import this store (it would cycle), so it calls back.
 */
setSessionLostHandler(() => {
  useSession.setState({ status: 'signedOut', onboarded: false });
});
