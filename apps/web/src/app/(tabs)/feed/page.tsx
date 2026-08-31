'use client';

import { useRef, useState } from 'react';

import { MAX_POST_CAPTION, REACTIONS, type ReactionKey } from '@buddy/shared';

import { useMe } from '@/api/auth';
import { usePostImageUpload } from '@/api/avatar';
import { useCreatePost, useDeletePost, useFeed, useReactToPost, type FeedPost } from '@/api/posts';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  Avatar,
  Button,
  Card,
  ErrorText,
  Field,
  RefreshButton,
  ReportSheet,
  Screen,
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
  const upload = usePostImageUpload();
  const createPost = useCreatePost();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageKey, setImageKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  const reset = () => {
    setImageKey(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCaption('');
  };

  return (
    <Card>
      {preview ? (
        <div className="flex flex-col gap-3">
          <img
            src={preview}
            alt="The photo you are about to post"
            className="max-h-80 w-full rounded-xl object-cover"
          />
          <Field
            label="Say something (optional)"
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_POST_CAPTION}
            hint={`${caption.length}/${MAX_POST_CAPTION}`}
            placeholder="Four hours, one chapter, no phone."
          />
          <ErrorText message={createPost.error?.message} />
          <div className="flex flex-row gap-2">
            <Button
              className="flex-1"
              label="Post"
              disabled={!imageKey || createPost.isPending}
              loading={createPost.isPending}
              onClick={() =>
                imageKey &&
                createPost.mutate(
                  { imageKey, ...(caption.trim() ? { caption: caption.trim() } : {}) },
                  { onSuccess: reset },
                )
              }
            />
            <Button label="Cancel" variant="ghost" className="w-auto" onClick={reset} />
          </div>
        </div>
      ) : (
        <>
          <Button
            label={upload.isPending ? 'Uploading…' : 'Post a photo'}
            disabled={upload.isPending}
            onClick={() => fileInputRef.current?.click()}
          />
          <ErrorText message={upload.error?.message} />
        </>
      )}

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
          // Shown from the local file immediately: the upload takes a moment and
          // a blank card while it runs reads as a failure.
          setPreview(URL.createObjectURL(file));
          upload.mutate(file, {
            onSuccess: (result) => setImageKey(result.key),
            onError: reset,
          });
        }}
      />
    </Card>
  );
}

function PostCard({ post, viewerId }: { post: FeedPost; viewerId: string }) {
  const react = useReactToPost();
  const remove = useDeletePost();
  const [reporting, setReporting] = useState(false);

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

      <img
        src={avatarUrl(post.imageKey) ?? ''}
        alt={post.caption ?? `A photo from ${post.author.displayName}`}
        loading="lazy"
        // crossOrigin for the same reason avatars carry it: the media route is a
        // different origin in development, and without it the image is opaque.
        crossOrigin="anonymous"
        className="w-full rounded-xl object-cover"
      />

      {post.caption ? <p className="mt-3 text-base text-ink">{post.caption}</p> : null}

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

      <div className="mt-3 flex flex-row justify-end gap-3">
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
