import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ReactionKey } from '@buddy/shared';

import { api, unwrap } from './client';

export interface FeedPost {
  id: string;
  imageKey: string;
  caption: string | null;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarKey: string | null };
  reactions: { reaction: ReactionKey; count: number; mine: boolean }[];
  mine: boolean;
}

export const feedKey = ['posts'] as const;

export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap<{ posts: FeedPost[]; nextCursor: string | null }>(
        await api.api.posts.$get({
          query: { ...(pageParam ? { cursor: pageParam } : {}) } as never,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { imageKey: string; caption?: string }) =>
      unwrap<{ id: string }>(await api.api.posts.$post({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });
}

/**
 * Reacting is a toggle, and it is optimistic: a reaction is the lightest
 * possible interaction, and waiting a round trip to see your own tap land makes
 * it feel broken. The rollback on error is what keeps that honest.
 */
export function useReactToPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, reaction }: { postId: string; reaction: ReactionKey }) =>
      unwrap<{ reaction: string; on: boolean }>(
        await api.api.posts[':id'].reactions.$post({
          param: { id: postId },
          json: { reaction },
        }),
      ),
    onMutate: async ({ postId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: feedKey });
      const previous = queryClient.getQueryData(feedKey);

      queryClient.setQueryData(
        feedKey,
        (old: { pages: { posts: FeedPost[] }[] } | undefined) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post.id === postId ? { ...post, reactions: toggle(post.reactions, reaction) } : post,
              ),
            })),
          },
      );

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(feedKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });
}

function toggle(reactions: FeedPost['reactions'], reaction: ReactionKey): FeedPost['reactions'] {
  const existing = reactions.find((r) => r.reaction === reaction);
  if (!existing) return [...reactions, { reaction, count: 1, mine: true }];

  const count = existing.mine ? existing.count - 1 : existing.count + 1;
  // A reaction nobody holds any more disappears rather than sitting at zero.
  if (count === 0) return reactions.filter((r) => r.reaction !== reaction);
  return reactions.map((r) => (r.reaction === reaction ? { ...r, count, mine: !r.mine } : r));
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ ok: true }>(await api.api.posts[':id'].$delete({ param: { id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });
}
