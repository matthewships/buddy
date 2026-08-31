import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { API_URL } from '@/api/client';
import { chatKeys, fetchChatTicket, type ChatMessage } from '@/api/chat';

/**
 * The live chat socket (§5.1).
 *
 * Design notes:
 * - **A fresh ticket per connection.** Tickets last 60 seconds, so one cannot be
 *   reused across reconnects; each attempt asks REST for a new one.
 * - **Incoming messages are merged into the Query cache**, not held in local
 *   state, so history and live messages are one list and survive navigation.
 * - **Reconnect backs off and gives up.** Retrying forever on a permanent
 *   failure (removed from the group, revoked session) would spin the radio and
 *   drain the battery; after a handful of attempts it surfaces as disconnected
 *   and waits for the user to retry.
 */
export type ChatStatus = 'connecting' | 'open' | 'closed';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

export function useChatSocket(groupId: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ChatStatus>('connecting');
  const [connected, setConnected] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Survives across reconnects so a teardown mid-connect cannot resurrect it.
  const cancelledRef = useRef(false);

  /** Adds a live message to the newest page of the cached history. */
  const appendMessage = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<{
        pages: { messages: ChatMessage[]; nextBefore: string | null }[];
        pageParams: unknown[];
      }>(chatKeys.history(groupId), (existing) => {
        if (!existing) return existing;
        const [first, ...rest] = existing.pages;
        if (!first) return existing;
        // The socket can echo a message the history fetch already returned.
        if (first.messages.some((m) => m.id === message.id)) return existing;
        return {
          ...existing,
          pages: [{ ...first, messages: [message, ...first.messages] }, ...rest],
        };
      });
    },
    [groupId, queryClient],
  );

  const connect = useCallback(async () => {
    if (cancelledRef.current || groupId.length === 0) return;

    setStatus('connecting');

    let ticket: string;
    try {
      ticket = await fetchChatTicket(groupId);
    } catch {
      // No ticket means no membership or no session; retrying won't fix it.
      setStatus('closed');
      return;
    }

    if (cancelledRef.current) return;

    const url = `${API_URL.replace(/^http/, 'ws')}/api/chat/${groupId}?ticket=${encodeURIComponent(
      ticket,
    )}`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      attemptsRef.current = 0;
      setStatus('open');
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as
          | { type: 'message'; message: ChatMessage }
          | { type: 'presence'; connected: number }
          | { type: 'focus'; userId: string }
          | { type: 'error'; message: string };

        if (payload.type === 'message') appendMessage(payload.message);
        if (payload.type === 'presence') setConnected(payload.connected);
        /**
         * Somebody's task started or ended. The room enforces the lock itself on
         * every message, so this is only a prompt to re-read the tasks and grey
         * the composer now rather than on the next attempt to send.
         */
        if (payload.type === 'focus') {
          void queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
      } catch {
        // A frame we can't parse is not worth tearing the connection down for.
      }
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (cancelledRef.current) return;

      setStatus('closed');
      if (attemptsRef.current >= MAX_ATTEMPTS) return;

      // Exponential backoff, so a server that is down isn't hammered.
      const delay = BASE_DELAY_MS * 2 ** attemptsRef.current;
      attemptsRef.current += 1;
      timerRef.current = setTimeout(() => void connect(), delay);
    };

    socket.onerror = () => {
      // onclose always follows, which is where reconnection is handled.
      socket.close();
    };
  }, [appendMessage, groupId]);

  useEffect(() => {
    cancelledRef.current = false;
    attemptsRef.current = 0;
    void connect();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  const send = useCallback((body: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ body }));
    return true;
  }, []);

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    void connect();
  }, [connect]);

  return { status, connected, send, retry };
}
