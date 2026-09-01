import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/auth/store';

import { ApiError, api, unwrap } from './client';
import type { StudentFields } from './users';

/**
 * Auth and profile hooks. Response unwrapping and the error envelope live in
 * client.ts, since every resource shares them.
 */

export { ApiError };

export function useRegister() {
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      displayName: string;
      /** Optional on the wire so the mobile app's call is unchanged (§2.1). */
      handle?: string;
    }) =>
      unwrap<{ ok: true; emailSent: true }>(await api.api.auth.register.$post({ json: input })),
  });
}

export function useVerifyEmail() {
  const signIn = useSession((s) => s.signIn);
  return useMutation({
    mutationFn: async (input: { email: string; code: string }) => {
      const body = await unwrap<{
        accessToken: string;
        refreshToken: string;
        user: { onboarded: boolean };
      }>(await api.api.auth['verify-email'].$post({ json: input }));
      await signIn(
        { accessToken: body.accessToken, refreshToken: body.refreshToken },
        body.user.onboarded,
      );
      return body;
    },
  });
}

export function useResendCode() {
  return useMutation({
    mutationFn: async (input: { email: string; purpose: 'verify' | 'reset' }) =>
      unwrap<{ ok: true }>(await api.api.auth['resend-code'].$post({ json: input })),
  });
}

/**
 * Login has two success shapes: a session, or a 403 telling the caller the
 * address still needs verifying. The 403 is not an error to show — it is a
 * navigation instruction — so it is mapped to a discriminated result.
 */
export type LoginResult =
  | { kind: 'session'; onboarded: boolean }
  | { kind: 'verificationRequired'; email: string };

export function useLogin() {
  const signIn = useSession((s) => s.signIn);
  return useMutation({
    mutationFn: async (input: { email: string; password: string }): Promise<LoginResult> => {
      const response = await api.api.auth.login.$post({ json: input });

      if (response.status === 403) {
        return { kind: 'verificationRequired', email: input.email };
      }

      const body = await unwrap<{
        accessToken: string;
        refreshToken: string;
        user: { onboarded: boolean };
      }>(response);
      await signIn(
        { accessToken: body.accessToken, refreshToken: body.refreshToken },
        body.user.onboarded,
      );
      return { kind: 'session', onboarded: body.user.onboarded };
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (input: { email: string }) =>
      unwrap<{ ok: true }>(await api.api.auth.forgot.$post({ json: input })),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: { email: string; code: string; newPassword: string }) =>
      unwrap<{ ok: true }>(await api.api.auth.reset.$post({ json: input })),
  });
}

export interface Me extends StudentFields {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  displayName: string;
  avatarKey: string | null;
  timezone: string;
  goalKey: string | null;
  goalKey2: string | null;
  /**
   * Every goal, in pick order. The server falls back to the indexed pair for an
   * account that predates the list, so this is always the complete answer and
   * `goalKey`/`goalKey2` are only the two the directory matches on.
   */
  goalKeys: string[];
  goalText: string | null;
  /** What `custom` means, when it is one of the interests. */
  interestText: string | null;
  occupationKey: string | null;
  occupationText: string | null;
  isOpenBuddy: boolean;
  /** Today's status, with expiry already applied by the server (§2.6). */
  statusKey: string | null;
  onboarded: boolean;
  /** False while the handle is still the placeholder registration assigns. */
  handleClaimed: boolean;
  createdAt: string;
  buddyProfile: {
    headline: string | null;
    about: string | null;
    availability: string | null;
    checkinStyle: string | null;
  } | null;
}

export const meQueryKey = ['me'] as const;

export function useMe() {
  const status = useSession((s) => s.status);
  return useQuery({
    queryKey: meQueryKey,
    // Only meaningful once signed in; querying while signed out would 401.
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<Me>(await api.api.me.$get()),
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  const setOnboarded = useSession((s) => s.setOnboarded);

  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      unwrap<Me>(await api.api.me.$patch({ json: patch as never })),
    onSuccess: (me) => {
      // The response is the updated profile, so seed the cache with it instead
      // of invalidating and paying for a second round trip.
      queryClient.setQueryData(meQueryKey, me);
      setOnboarded(me.onboarded);
    },
  });
}

/**
 * Sets or clears today's status.
 *
 * The group query is invalidated as well as `me`: the status is shown on the
 * member strip, and the copy of it there comes from the group response rather
 * than from this one.
 */
export function useSetStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (statusKey: string | null) =>
      unwrap<{ statusKey: string | null; statusDate: string | null }>(
        await api.api.me.status.$put({ json: { statusKey } as never }),
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(meQueryKey, (previous: Me | undefined) =>
        previous ? { ...previous, statusKey: result.statusKey } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useHandleAvailable(handle: string) {
  const trimmed = handle.trim().toLowerCase();
  return useQuery({
    queryKey: ['handle-available', trimmed],
    enabled: /^[a-z0-9_]{3,24}$/.test(trimmed),
    queryFn: async () =>
      unwrap<{ handle: string; available: boolean }>(
        await api.api.me['handle-available'].$get({ query: { handle: trimmed } }),
      ),
  });
}
