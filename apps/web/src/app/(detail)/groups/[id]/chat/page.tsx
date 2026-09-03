'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { MAX_MESSAGE_BODY } from '@buddy/shared';

import { useMe } from '@/api/auth';
import { useChatHistory, type ChatMessage } from '@/api/chat';
import { useGroup } from '@/api/groups';
import { isRunning, useGroupTasks } from '@/api/tasks';
import { useChatSocket } from '@/chat/useChatSocket';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { Avatar, BackLink, Spinner, TaskClock } from '@/components';

export default function Chat() {
  const id = useParams<{ id: string }>().id;
  const me = useMe();
  const history = useChatHistory(id);
  const socket = useChatSocket(id);
  const group = useGroup(id);
  const tasks = useGroupTasks(id);

  const [draft, setDraft] = useState('');

  /**
   * The focus lock (§2.4). Starting a task closes this room to its owner until
   * the task ends — the whole point of starting one.
   *
   * Enforced by the server on every message; this only mirrors it, so the
   * composer explains itself instead of accepting text and refusing it. Reading
   * the same condition the server does keeps them saying the same thing.
   */
  const myRunningTask = (tasks.data?.tasks ?? []).find(
    (task) => task.userId === me.data?.id && isRunning(task),
  );

  /**
   * Avatars come from the group's member list rather than from each message.
   * The payload carries a name and a handle, not a picture, and adding one to
   * every message would mean sending the same URL hundreds of times and keeping
   * it correct when somebody changes their photo. Anyone who has since left the
   * group falls back to their initials, which is what Avatar does anyway.
   */
  const avatarFor = (senderId: string) =>
    group.data?.members.find((member) => member.id === senderId)?.avatarKey ?? null;

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

  const locked = Boolean(myRunningTask);
  const canSend = draft.trim().length > 0 && socket.status === 'open' && !locked;

  const send = () => {
    const body = draft.trim();
    if (!body || socket.status !== 'open' || locked) return;
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
              avatarKey={avatarFor(message.senderId)}
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

      {locked && myRunningTask?.startedAt && myRunningTask.estimatedMinutes !== null ? (
        <div className="flex flex-row items-center justify-between gap-3 rounded-lg border border-brand bg-surface-muted px-4 py-3">
          <div className="flex flex-1 flex-col">
            <p className="text-sm font-semibold text-ink">
              You&apos;re working on &ldquo;{myRunningTask.title}&rdquo;
            </p>
            <p className="text-xs text-ink-muted">
              Chat opens again when you finish it. Dropping it costs 10 points.
            </p>
          </div>
          <TaskClock
            startedAt={myRunningTask.startedAt}
            estimatedMinutes={myRunningTask.estimatedMinutes}
          />
        </div>
      ) : null}

      <div className="flex flex-row items-end gap-2 border-t border-surface-border py-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            locked
              ? 'Finish your task to chat'
              : socket.status === 'open'
                ? 'Message'
                : 'Reconnecting…'
          }
          disabled={socket.status !== 'open' || locked}
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
          className="max-h-28 min-h-12 flex-1 resize-none rounded-lg border border-surface-border bg-surface px-4 py-3 text-base text-ink outline-none placeholder:text-ink-subtle focus:border-brand disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Send message"
          disabled={!canSend}
          onClick={send}
          className={`h-12 rounded-lg px-5 font-semibold transition-colors ${
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

/**
 * Every colour the theme actually defines, and no more — an invented token
 * compiles to nothing and shows up as an unstyled name, which is worse than
 * having fewer colours. Five is plenty for a group of the size Buddy is for.
 */
const SENDER_COLOURS = [
  'text-brand',
  'text-success',
  'text-warning',
  'text-danger',
  'text-ink-muted',
] as const;

/**
 * A stable colour per person, derived from their id rather than their position
 * in the list — the same person must not change colour when someone else joins,
 * or when a page of history loads above them.
 */
function senderColour(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return SENDER_COLOURS[Math.abs(hash) % SENDER_COLOURS.length]!;
}

/**
 * A message.
 *
 * The sender's name was always here; what a group of three or more needs is to
 * tell people apart *without reading* — so the name carries a stable colour and
 * an avatar sits beside the bubble. Own messages need neither: they are already
 * distinguished by side and fill.
 */
function Bubble({
  message,
  mine,
  avatarKey,
}: {
  message: ChatMessage;
  mine: boolean;
  avatarKey: string | null;
}) {
  return (
    <div className={`flex max-w-[85%] flex-row items-end gap-2 ${mine ? 'self-end' : 'self-start'}`}>
      {!mine ? (
        <Avatar avatarKey={avatarKey} displayName={message.senderDisplayName} size={28} />
      ) : null}

      <div className="flex flex-col">
        {!mine ? (
          <p className={`mb-0.5 text-xs font-semibold ${senderColour(message.senderId)}`}>
            {message.senderDisplayName}
          </p>
        ) : null}
        <div
          className={`rounded-lg px-4 py-2.5 ${
            mine ? 'bg-brand' : 'border border-surface-border bg-surface'
          }`}
        >
          <p
            className={`whitespace-pre-wrap break-words text-base ${mine ? 'text-brand-fg' : 'text-ink'}`}
          >
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
