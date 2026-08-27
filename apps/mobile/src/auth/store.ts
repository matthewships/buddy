import { create } from 'zustand';

import { clearTokens, getAccessToken, saveTokens, type Tokens } from './session';

/**
 * Session state (§5.1): a deliberately small Zustand store for who is signed
 * in. Everything else — profile, tasks, groups — is server data and belongs to
 * TanStack Query, not here.
 */
interface SessionState {
  status: 'loading' | 'signedIn' | 'signedOut';
  signIn: (tokens: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',

  signIn: async (tokens) => {
    await saveTokens(tokens);
    set({ status: 'signedIn' });
  },

  signOut: async () => {
    await clearTokens();
    set({ status: 'signedOut' });
  },

  /** Called once at startup to decide which navigation stack to show. */
  restore: async () => {
    const token = await getAccessToken();
    set({ status: token ? 'signedIn' : 'signedOut' });
  },
}));
