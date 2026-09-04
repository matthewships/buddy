'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  useCreateGroup,
  useGroups,
  useInvites,
  useRespondToInvite,
  type GroupSummary,
} from '@/api/groups';
import { useReviewQueue } from '@/api/tasks';
import { Button, Card, ErrorText, Field, RefreshButton, Screen, Spinner } from '@/components';

export default function Groups() {
  const router = useRouter();
  const groups = useGroups();
  const reviewQueue = useReviewQueue();
  const invites = useInvites();
  const createGroup = useCreateGroup();
  const respond = useRespondToInvite();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const list = groups.data?.groups ?? [];

  // One request for every group's outstanding reviews, rather than one per row.
  // The API already applies the Buddy rule, so this counts only what the viewer
  // can actually act on.
  const waitingByGroup = new Map<string, number>();
  for (const task of reviewQueue.data?.tasks ?? []) {
    waitingByGroup.set(task.groupId, (waitingByGroup.get(task.groupId) ?? 0) + 1);
  }

  const create = () => {
    if (name.trim().length === 0 || createGroup.isPending) return;
    createGroup.mutate(
      { name: name.trim() },
      {
        onSuccess: (result) => {
          setName('');
          setCreating(false);
          router.push(`/groups/${result.group.id}`);
        },
      },
    );
  };

  return (
    <Screen>
      <div className="mb-1 mt-2 flex flex-row items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Groups</h1>
        <RefreshButton busy={groups.isRefetching} onClick={() => void groups.refetch()} />
      </div>

      {/* Pending invites sit above the list — they need a decision. */}
      {invites.data?.invites.map((invite) => (
        <Card key={invite.id} className="border-brand">
          <p className="text-base font-bold text-ink">
            {invite.fromDisplayName} invited you to {invite.groupName}
          </p>
          <p className="text-sm text-ink-muted">@{invite.fromHandle}</p>
          <div className="mt-3 flex flex-row gap-2">
            <Button
              label="Join"
              className="flex-1"
              disabled={respond.accept.isPending}
              onClick={() =>
                respond.accept.mutate(invite.id, {
                  onSuccess: (result) => {
                    if (result.group) router.push(`/groups/${result.group.id}`);
                  },
                })
              }
            />
            <Button
              label="Decline"
              variant="ghost"
              className="flex-1"
              disabled={respond.decline.isPending}
              onClick={() => respond.decline.mutate(invite.id)}
            />
          </div>
        </Card>
      ))}

      {creating ? (
        <Card>
          <Field
            label="Group name"
            value={name}
            onChangeText={setName}
            placeholder="Finals crew"
            autoFocus
            onSubmit={create}
          />
          <ErrorText message={createGroup.error?.message} />
          <div className="mt-3 flex flex-row gap-2">
            <Button
              label="Create"
              className="flex-1"
              disabled={name.trim().length === 0 || createGroup.isPending}
              loading={createGroup.isPending}
              onClick={create}
            />
            <Button
              label="Cancel"
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setCreating(false);
                setName('');
              }}
            />
          </div>
        </Card>
      ) : /*
          The "New group" button is for someone who already has one. With an
          empty list it would sit above a card explaining the list is empty,
          which is two halves of one idea — so the empty state below carries
          the action instead.
        */
      list.length > 0 ? (
        <Button label="New group" variant="secondary" onClick={() => setCreating(true)} />
      ) : null}

      {list.length === 0 ? (
        groups.isPending ? (
          <div className="flex items-center justify-center py-8 text-ink-subtle">
            <Spinner />
          </div>
        ) : (
          /*
            The first screen of an empty account, and the one that decides
            whether anything else happens.

            It used to send people to `@handle` invites, which can only name
            somebody who already signed up — so the first thing a new user was
            told to do was the one thing they could not do, since they know
            nobody here yet. The link is what grows a group, and it is inside a
            group, so the honest order is: make the group, then send the link.
          */
          <Card>
            <p className="text-base font-bold text-ink">Start with one group.</p>
            <p className="mt-1 text-sm text-ink-muted">
              A group is where a task lives — you write down what you&rsquo;ll finish today, and
              someone checks it off. Name it after the people, not the work: your flatmates, your
              seminar, two friends from the library.
            </p>
            <p className="mt-2 text-sm text-ink-subtle">
              Once it exists you get a link to send on WhatsApp or anywhere else. They can join
              even if they have never used Buddy.
            </p>
            <div className="mt-4">
              <Button label="Create your first group" onClick={() => setCreating(true)} />
            </div>
          </Card>
        )
      ) : (
        list.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            waiting={waitingByGroup.get(group.id) ?? 0}
            onOpen={() => router.push(`/groups/${group.id}`)}
          />
        ))
      )}
    </Screen>
  );
}

function GroupRow({
  group,
  waiting,
  onOpen,
}: {
  group: GroupSummary;
  waiting: number;
  onOpen: () => void;
}) {
  return (
    <Card className={waiting > 0 ? 'border-warning' : undefined}>
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-1 flex-col">
          <p className="text-lg font-bold text-ink">
            {group.emoji ? `${group.emoji} ` : ''}
            {group.name}
          </p>
          <p className="text-sm text-ink-muted">
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
            {group.kind === 'matched' ? ' · matched buddy' : ''}
          </p>
          {/*
            What the Today tab's cross-group review queue became. It is per-group
            now because the reviewer is: with a Buddy named, who reviews is a
            property of the group rather than of whoever arrives first.
          */}
          {waiting > 0 ? (
            <p className="mt-1 text-sm font-semibold text-warning">
              {waiting} waiting on you
            </p>
          ) : null}
        </div>
        <Button label="Open" variant="ghost" className="w-auto" onClick={onOpen} />
      </div>
    </Card>
  );
}
