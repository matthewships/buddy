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
import { Button, Card, ErrorText, Field, RefreshButton, Screen, Spinner } from '@/components';

export default function Groups() {
  const router = useRouter();
  const groups = useGroups();
  const invites = useInvites();
  const createGroup = useCreateGroup();
  const respond = useRespondToInvite();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const list = groups.data?.groups ?? [];

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
      ) : (
        <Button label="New group" variant="secondary" onClick={() => setCreating(true)} />
      )}

      {list.length === 0 ? (
        groups.isPending ? (
          <div className="flex items-center justify-center py-8 text-ink-subtle">
            <Spinner />
          </div>
        ) : (
          <Card>
            <p className="text-base text-ink">No groups yet.</p>
            <p className="mt-1 text-sm text-ink-subtle">
              Create one and invite people by @handle, or find a buddy in the Buddies tab.
            </p>
          </Card>
        )
      ) : (
        list.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            onOpen={() => router.push(`/groups/${group.id}`)}
          />
        ))
      )}
    </Screen>
  );
}

function GroupRow({ group, onOpen }: { group: GroupSummary; onOpen: () => void }) {
  return (
    <Card>
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
        </div>
        <Button label="Open" variant="ghost" className="w-auto" onClick={onOpen} />
      </div>
    </Card>
  );
}
