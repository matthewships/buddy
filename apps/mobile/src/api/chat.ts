import { useInfiniteQuery } from '@tanstack/react-query';

import { api, unwrap } from './client';

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderHandle: string;
  senderDisplayName: string;
  body: string;
  createdAt: string;
}

export const chatKeys = {
  history: (groupId: string) => ['chat', groupId] as const,
};

/** History from D1, newest-first, paged on `before`. */
export function useChatHistory(groupId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.history(groupId),
    enabled: groupId.length > 0,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap<{ messages: ChatMessage[]; nextBefore: string | null }>(
        await api.api.groups[':id'].messages.$get({
          param: { id: groupId },
          query: { ...(pageParam ? { before: pageParam } : {}) } as never,
        }),
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}

export async function fetchChatTicket(groupId: string): Promise<string> {
  const body = await unwrap<{ ticket: string; expiresAt: string }>(
    await api.api.groups[':id']['chat-ticket'].$post({ param: { id: groupId } }),
  );
  return body.ticket;
}
