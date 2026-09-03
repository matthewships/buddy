'use client';

import { useRef, useState } from 'react';

import { MAX_POST_CAPTION, MAX_REPLY_TEXT, REACTIONS, type ReactionKey } from '@buddy/shared';

import { useMe } from '@/api/auth';
import { usePostImageUpload } from '@/api/avatar';
import {
  useCreatePost,
  useCreateReply,
  useDeletePost,
  useFeed,
  useReactToPost,
  useReplies,
  type FeedPost,
} from '@/api/posts';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { timeAgo } from '@/lib/time-ago';
import {
  Avatar,
  Button,
  Card,
  ErrorText,
  Field,
  RefreshButton,
  ReportSheet,
  Screen,
  Sheet,
  Spinner,
  avatarUrl,
} from '@/components';

/**
 * The Feed (§2.7).
 *
 * The one screen in Buddy that is not about being marked. Everywhere else
 * somebody rates your work, asks for proof or watches a clock run down; here
 * people post a photo and other people are pleased for them. That is why the
 * reactions are a closed, positive set — a product built on other people judging
 * your output should not also hand them a way to boo.
 *
 * Global rather than scoped to a group, which is also what makes it the one
 * useful screen for an account that has just signed up and has nobody yet.
 */
export default function Feed() {
  const me = useMe();
  const feed = useFeed();

  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? [];
  const sentinelRef = useInfiniteScroll(() => void feed.fetchNextPage(), {
    enabled: feed.hasNextPage && !feed.isFetchingNextPage,
  });

  return (
    <Screen>
      <div className="mb-1 mt-2 flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Feed</h1>
        <RefreshButton busy={feed.isRefetching} onClick={() => void feed.refetch()} />
      </div>

      <Composer />

      {posts.length === 0 ? (
        feed.isPending ? (
          <div className="flex items-center justify-center py-8 text-ink-subtle">
            <Spinner />
          </div>
        ) : (
          <Card>
            <p className="text-base text-ink">Nothing here yet.</p>
            <p className="mt-1 text-sm text-ink-subtle">
              Post the desk, the whiteboard, the finished thing. Someone will be pleased for you.
            </p>
          </Card>
        )
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} viewerId={me.data?.id ?? ''} />
          ))}
          <div ref={sentinelRef} aria-hidden="true" />
          {feed.isFetchingNextPage ? (
            <div className="flex items-center justify-center py-4 text-ink-subtle">
              <Spinner />
            </div>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Composer() {
  const me = useMe();
  const upload = usePostImageUpload();
  const createPost = useCreatePost();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  const reset = () => {
    setImageKey(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCaption('');
    setOpen(false);
  };

  const dropPhoto = () => {
    setImageKey(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  /**
   * A post needs words or a photo — the API refuses neither, and a caption of
   * spaces is not words. A photo still uploading is not one yet either: the key
   * arrives when the upload lands.
   */
  const canPost = (caption.trim().length > 0 || imageKey !== null) && !upload.isPending;

  const submit = () => {
    if (!canPost) return;
    createPost.mutate(
      {
        ...(imageKey ? { imageKey } : {}),
        ...(caption.trim() ? { caption: caption.trim() } : {}),
      },
      { onSuccess: reset },
    );
  };

  const pickPhoto = () => fileInputRef.current?.click();

  const photoInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        // Reset so choosing the same file twice fires change again.
        event.target.value = '';
        if (!file) return;
        setOpen(true);
        // Shown from the local file immediately: the upload takes a moment and
        // a blank card while it runs reads as a failure.
        setPreview(URL.createObjectURL(file));
        upload.mutate(file, {
          onSuccess: (result) => setImageKey(result.key),
          onError: dropPhoto,
        });
      }}
    />
  );

  /*
    Closed, the composer is a prompt rather than a call to action: posting is
    something you do when you have something to show, so it sits quietly in the
    list looking like the thing it makes. The picture icon opens the same form
    with the file dialog already up — one tap either way, and the words are no
    longer the only way in.
  */
  if (!open) {
    return (
      <Card>
        <div className="flex flex-row items-center gap-3">
          <Avatar
            avatarKey={me.data?.avatarKey ?? null}
            displayName={me.data?.displayName ?? ''}
            size={40}
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-1 cursor-pointer rounded-full border border-surface-border bg-surface-muted px-4 py-2.5 text-left text-sm text-ink-subtle transition-colors hover:border-brand"
          >
            Post to feed
          </button>
          <button
            type="button"
            aria-label="Add a photo"
            title="Add a photo"
            onClick={pickPhoto}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-surface-border bg-surface text-ink-muted transition-colors hover:border-brand hover:text-brand"
          >
            <PhotoIcon />
          </button>
        </div>
        <ErrorText message={upload.error?.message} />
        {photoInput}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <Field
          label="Post to feed"
          value={caption}
          onChangeText={setCaption}
          maxLength={MAX_POST_CAPTION}
          hint={`${caption.length}/${MAX_POST_CAPTION}`}
          placeholder="Four hours, one chapter, no phone."
          multiline
          rows={3}
          autoFocus
        />

        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="The photo you are about to post"
              className="max-h-80 w-full rounded-md object-cover"
            />
            {upload.isPending ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/30 text-sm font-semibold text-white">
                Uploading…
              </span>
            ) : (
              <button
                type="button"
                aria-label="Remove this photo"
                onClick={dropPhoto}
                className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-lg leading-none text-white"
              >
                ×
              </button>
            )}
          </div>
        ) : null}

        <ErrorText message={upload.error?.message ?? createPost.error?.message} />

        <div className="flex flex-row items-center gap-2">
          {/* The photo is optional now, so it is an icon beside Post rather than
              the thing standing between someone and posting at all. */}
          <button
            type="button"
            aria-label={preview ? 'Replace the photo' : 'Add a photo'}
            title={preview ? 'Replace the photo' : 'Add a photo'}
            onClick={pickPhoto}
            disabled={upload.isPending}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-surface-border bg-surface text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PhotoIcon />
          </button>
          <Button
            className="flex-1"
            label="Post"
            disabled={!canPost || createPost.isPending}
            loading={createPost.isPending}
            onClick={submit}
          />
          <Button label="Cancel" variant="ghost" className="w-auto" onClick={reset} />
        </div>
      </div>

      {photoInput}
    </Card>
  );
}

/** A picture with a plus — "a photo can go here", in one glyph. */
function PhotoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="3" y="4" width="14" height="14" rx="2.5" />
      <circle cx="8" cy="9" r="1.4" />
      <path d="M3.6 15.5 7.5 12l3.4 3M19 14v6m3-3h-6" />
    </svg>
  );
}

function PostCard({ post, viewerId }: { post: FeedPost; viewerId: string }) {
  const react = useReactToPost();
  const remove = useDeletePost();
  const [reporting, setReporting] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);

  return (
    <Card>
      <div className="mb-3 flex flex-row items-center gap-3">
        <Avatar
          avatarKey={post.author.avatarKey}
          displayName={post.author.displayName}
          size={36}
        />
        <div className="flex flex-1 flex-col">
          <p className="text-base font-semibold text-ink">{post.author.displayName}</p>
          <p className="text-xs text-ink-subtle">
            @{post.author.handle} · {new Date(post.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* A post may be words alone, so the photo is conditional — and when it is
          the only content, the caption below it is what is missing instead. */}
      {post.imageKey ? (
        <img
          src={avatarUrl(post.imageKey) ?? ''}
          alt={post.caption ?? `A photo from ${post.author.displayName}`}
          loading="lazy"
          // crossOrigin for the same reason avatars carry it: the media route is
          // a different origin in development, and without it the image is
          // opaque.
          crossOrigin="anonymous"
          className="w-full rounded-md object-cover"
        />
      ) : null}

      {post.caption ? (
        <p className={`text-base text-ink ${post.imageKey ? 'mt-3' : ''}`}>{post.caption}</p>
      ) : null}

      <div className="mt-3 flex flex-row flex-wrap gap-2">
        {REACTIONS.map((option) => {
          const state = post.reactions.find((r) => r.reaction === option.key);
          const mine = state?.mine ?? false;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={mine}
              aria-label={option.label}
              disabled={react.isPending}
              onClick={() =>
                react.mutate({ postId: post.id, reaction: option.key as ReactionKey })
              }
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                mine
                  ? 'border-brand bg-surface-muted font-semibold text-ink'
                  : 'border-surface-border bg-surface text-ink-muted hover:border-brand'
              }`}
            >
              <span aria-hidden="true">{option.emoji}</span>
              {state?.count ? <span className="ml-1.5 text-xs">{state.count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-row items-center gap-3">
        {/*
          Replies sit with the reactions, not under them: they are the other
          half of the same gesture. The count is on the button because the
          number is the reason to press it.
        */}
        <button
          type="button"
          onClick={() => setRepliesOpen(true)}
          className="flex cursor-pointer flex-row items-center gap-1.5 rounded-full border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5Z" />
          </svg>
          <span>{post.replyCount === 0 ? 'Reply' : post.replyCount}</span>
        </button>

        <div className="flex flex-1 flex-row justify-end gap-3">
        {post.author.id === viewerId ? (
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(post.id)}
            className="cursor-pointer text-xs text-ink-subtle hover:text-danger"
          >
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="cursor-pointer text-xs text-ink-subtle hover:text-ink-muted"
          >
            Report
          </button>
        )}
        </div>
      </div>

      {/*
        The last couple of replies, under the post, the way every feed people
        already use shows them. The count on its own said a conversation
        existed without letting anyone overhear it, and a conversation nobody
        can see is one nobody joins.
      */}
      {post.replyPreview.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-surface-border pt-3">
          {post.replyCount > post.replyPreview.length ? (
            <button
              type="button"
              onClick={() => setRepliesOpen(true)}
              className="cursor-pointer self-start text-xs font-semibold text-ink-subtle hover:text-ink"
            >
              View all {post.replyCount} replies
            </button>
          ) : null}
          {post.replyPreview.map((reply) => (
            <button
              key={reply.id}
              type="button"
              onClick={() => setRepliesOpen(true)}
              className="cursor-pointer text-left text-sm leading-snug text-ink"
            >
              <span className="font-semibold">{reply.author.handle}</span>{' '}
              <span className="text-ink-muted">{reply.body}</span>{' '}
              <span className="whitespace-nowrap text-xs text-ink-subtle">
                {timeAgo(reply.createdAt)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <RepliesSheet
        post={post}
        open={repliesOpen}
        onClose={() => setRepliesOpen(false)}
      />

      <ReportSheet
        visible={reporting}
        targetType="post"
        targetId={post.id}
        targetLabel={post.caption ?? 'this post'}
        onClose={() => setReporting(false)}
      />
    </Card>
  );
}

/**
 * Every reply on one post, and the box to add another.
 *
 * A sheet rather than an inline thread. On a phone-shaped column, expanding
 * five replies under a post pushes the next post off the screen, and the Feed's
 * job is to be scrollable. It also means the list is only fetched for the post
 * somebody actually opened.
 */
function RepliesSheet({
  post,
  open,
  onClose,
}: {
  post: FeedPost;
  open: boolean;
  onClose: () => void;
}) {
  const replies = useReplies(post.id, open);
  const createReply = useCreateReply(post.id);
  const me = useMe().data;
  const [body, setBody] = useState('');

  const send = () => {
    if (body.trim().length === 0 || createReply.isPending) return;
    createReply.mutate(body.trim(), { onSuccess: () => setBody('') });
  };

  const list = replies.data?.replies ?? [];

  return (
    <Sheet open={open} onClose={onClose} title={`Replies to ${post.author.displayName}'s post`}>
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-bold text-ink">
          {list.length === 1 ? '1 reply' : `${list.length} replies`}
        </h2>
        <Button label="Close" variant="ghost" className="w-auto" onClick={onClose} />
      </div>

      {replies.isPending && open ? (
        <div className="flex items-center justify-center py-6 text-ink-subtle">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <p className="py-2 text-sm text-ink-subtle">
          Nothing yet. Be the one who says something.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((reply) => (
            <div key={reply.id} className="flex flex-row items-start gap-2.5">
              <Avatar
                avatarKey={reply.author.avatarKey}
                displayName={reply.author.displayName}
                size={32}
              />
              {/*
                The handle alone, with the time beside it. The bubble used to
                carry the display name *and* the handle on its own line above
                every message, which is two names for one person and a wasted
                line in a list of one-sentence replies.
              */}
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="text-sm leading-snug text-ink">
                  <span className="font-semibold">{reply.author.handle}</span>{' '}
                  <span className="text-ink-muted">{reply.body}</span>
                </p>
                <span className="mt-0.5 text-xs text-ink-subtle">
                  {timeAgo(reply.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        One row, stuck to the bottom: your face, a box, and send.
        It was a labelled field stacked above a full-width button — about a
        hundred pixels of form for one short sentence, with the label repeating
        what the placeholder already said, and it scrolled away with the thread
        so a long one had to be scrolled past before you could answer it.
      */}
      <div className="sticky bottom-0 -mx-5 mt-2 flex flex-col gap-1 border-t border-surface-border bg-surface px-5 pb-1 pt-3">
        <div className="flex flex-row items-center gap-2">
          <Avatar avatarKey={me?.avatarKey ?? null} displayName={me?.displayName ?? 'You'} size={32} />
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            maxLength={MAX_REPLY_TEXT}
            placeholder="Say something"
            aria-label="Write a reply"
            className="min-w-0 flex-1 rounded-full border border-surface-border bg-surface-muted px-4 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            aria-label="Send reply"
            disabled={body.trim().length === 0 || createReply.isPending}
            onClick={send}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-brand-fg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
              <path d="M3.4 20.4 21 12 3.4 3.6 3 10.2l12 1.8-12 1.8z" />
            </svg>
          </button>
        </div>
        <ErrorText message={createReply.error?.message ?? replies.error?.message} />
      </div>
    </Sheet>
  );
}
