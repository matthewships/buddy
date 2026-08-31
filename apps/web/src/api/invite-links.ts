import { useMutation, useQuery } from '@tanstack/react-query';

import { api, unwrap } from './client';

export interface InvitePreview {
  group: { name: string; emoji: string | null };
  invitedBy: string;
  valid: true;
}

/**
 * The preview shown at /join/[token], before the visitor has an account.
 *
 * Deliberately not gated on a session: this is the screen that has to convince
 * someone arriving from a WhatsApp message to go through signup at all, and it
 * cannot do that if it needs the account signup would create.
 */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invite-link', token],
    enabled: token.length > 0,
    // A bad or spent link is a real answer, not a transient failure.
    retry: false,
    queryFn: async () =>
      unwrap<InvitePreview>(await api.api['invite-links'][':token'].$get({ param: { token } })),
  });
}

export function useAcceptInviteLink() {
  return useMutation({
    mutationFn: async (token: string) =>
      unwrap<{ group: { id: string; name: string }; joined: boolean }>(
        await api.api['invite-links'][':token'].accept.$post({ param: { token } }),
      ),
  });
}
