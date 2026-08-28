'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { MAX_MESSAGE_BODY } from '@buddy/shared';

import { useMe } from '@/api/auth';
import { useChatHistory, type ChatMessage } from '@/api/chat';
import { useChatSocket } from '@/chat/useChatSocket';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { BackLink, Spinner } from '@/components';

export default function Chat() {
  const id = useParams<{ id: string }>().id;
  const me = useMe();
  const history = useChatHistory(id);
  const socket = useChatSocket(id);

  const [draft, setDraft] = useState('');

  // The API returns newest-first, and the column below is reversed, so the
  // flattened order is used as-is — the same reason the mobile list is inverted.
  const messages = useMemo(
    () => history.data?.pages.flatMap((page) => page.messages) ?? [],
    [history.data],
  );

  // Last in DOM order, which `flex-col-reverse` puts visually at the top: the
  // web equivalent of an inverted list's `onEndReached`.
  const sentinelRef = useInfiniteScroll(() => void history.fetchNextPage(), {
    enabled: history.hasNextPage && !history.isFetchingNextPage,
  });

  const canSend = draft.trim().length > 0 && socket.status === 'open';

  const send = () => {
    const body = draft.trim();
    if (!body || socket.status !== 'open') return;
    // The socket echoes the stored message back, so there is no optimistic
    // insert to reconcile — the server assigns the id and timestamp.
    if (socket.send(body)) setDraft('');
  };

  return (
    /*
     * `h-dvh` rather than the usual Screen frame: the composer stays put while
     * only the message column scrolls, which needs a bounded height to scroll
     * inside. `min-h-0` on that column is what lets a flex child shrink below
     * its content and actually produce a scrollbar.
     */
    <div className="flex h-dvh flex-col px-5">
      <div className="flex flex-row items-center justify-between gap-3 pt-1">
        <BackLink fallback={`/groups/${id}`} label="Group" />
        <ConnectionPill status={socket.status} onRetry={socket.retry} />
      </div>

      <h1 className="pb-2 text-2xl font-bold text-ink">Chat</h1>

      {history.isPending ? (
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center text-base text-ink-subtle">No messages yet. Say hello.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col-reverse gap-2 overflow-y-auto py-2">
          {messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              mine={message.senderId === me.data?.id}
            />
          ))}
          {history.isFetchingNextPage ? (
            <div className="flex justify-center py-2 text-ink-subtle">
              <Spinner size={14} />
            </div>
          ) : null}
          <div ref={sentinelRef} aria-hidden="true" />
        </div>
      )}

      <div className="flex flex-row items-end gap-2 border-t border-surface-border py-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={socket.status === 'open' ? 'Message' : 'Reconnecting…'}
          disabled={socket.status !== 'open'}
          maxLength={MAX_MESSAGE_BODY}
          aria-label="Message"
          rows={1}
          // Enter sends and Shift+Enter breaks the line, which is the chat
          // convention on a physical keyboard. The mobile field has no such
          // distinction to make.
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border border-surface-border bg-surface px-4 py-3 text-base text-ink outline-none placeholder:text-ink-subtle focus:border-brand disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Send message"
          disabled={!canSend}
          onClick={send}
          className={`h-12 rounded-2xl px-5 font-semibold transition-colors ${
            canSend
              ? 'cursor-pointer bg-brand text-brand-fg hover:bg-brand/90'
              : 'cursor-not-allowed bg-surface-border text-ink-subtle'
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div className={`flex max-w-[80%] flex-col ${mine ? 'self-end' : 'self-start'}`}>
      {!mine ? (
        <p className="mb-0.5 text-xs text-ink-subtle">{message.senderDisplayName}</p>
      ) : null}
      <div
        className={`rounded-2xl px-4 py-2.5 ${
          mine ? 'bg-brand' : 'border border-surface-border bg-surface'
        }`}
      >
        <p className={`whitespace-pre-wrap break-words text-base ${mine ? 'text-brand-fg' : 'text-ink'}`}>
          {message.body}
        </p>
      </div>
      <p className={`mt-0.5 text-xs text-ink-subtle ${mine ? 'text-right' : ''}`}>
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
  );
}

function ConnectionPill({
  status,
  onRetry,
}: {
  status: 'connecting' | 'open' | 'closed';
  onRetry: () => void;
}) {
  if (status === 'open') {
    return (
      <div className="flex flex-row items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
        <span className="text-xs text-ink-subtle">Live</span>
      </div>
    );
  }

  if (status === 'connecting') {
    return <span className="text-xs text-ink-subtle">Connecting…</span>;
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      className="cursor-pointer text-xs font-semibold text-brand hover:opacity-80"
    >
      Disconnected · Retry
    </button>
  );
}
