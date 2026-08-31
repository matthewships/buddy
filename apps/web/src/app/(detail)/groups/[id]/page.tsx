'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { handleSchema } from '@buddy/shared';

import { useMe } from '@/api/auth';
import {
  useCreateInviteLink,
  useGroup,
  useInviteToGroup,
  useLeaveGroup,
  useSetGroupBuddy,
  type GroupDetail,
  type GroupMember,
} from '@/api/groups';
import {
  Avatar,
  BackLink,
  Button,
  Card,
  ErrorText,
  Field,
  GroupTasks,
  Screen,
  SharePanel,
  Spinner,
} from '@/components';
import { activityLabel } from '@/lib/activity';
import { verifierFor } from '@/lib/review-rights';

export default function GroupDetailPage() {
  const router = useRouter();
  const id = useParams<{ id: string }>().id;

  const me = useMe();
  const group = useGroup(id);
  const invite = useInviteToGroup(id);
  const leave = useLeaveGroup();

  const [handle, setHandle] = useState('');
  const handleValid = handleSchema.safeParse(handle).success;

  if (group.isPending || me.isPending) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center text-ink-subtle">
          <Spinner />
        </div>
      </Screen>
    );
  }

  if (group.isError || !group.data || !me.data) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-base text-danger">
            {group.error?.message ?? "Couldn't load that group."}
          </p>
          <Button label="Go back" variant="ghost" onClick={() => router.replace('/groups')} />
        </div>
      </Screen>
    );
  }

  const { group: info, members } = group.data;
  const viewerId = me.data.id;

  return (
    <Screen>
      <BackLink fallback="/groups" label="Groups" />

      <div className="flex flex-col">
        <h1 className="text-3xl font-bold text-ink">
          {info.emoji ? `${info.emoji} ` : ''}
          {info.name}
        </h1>
        <p className="text-sm text-ink-subtle">
          {members.length} {members.length === 1 ? 'member' : 'members'} · checked by{' '}
          {verifierFor(info, members, viewerId)}
        </p>
      </div>

      <GroupTasks group={info} members={members} viewerId={viewerId} />

      <BuddyCard group={info} members={members} viewerId={viewerId} />

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Members</p>
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-row items-center gap-3 border-t border-surface-border py-2 first:border-t-0"
          >
            <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={40} />
            <div className="flex flex-1 flex-col">
              <p className="text-base font-semibold text-ink">
                {member.displayName}
                {member.id === info.buddyUserId ? ' · Buddy' : ''}
                {member.role === 'owner' ? ' · owner' : ''}
              </p>
              <p className="text-sm text-ink-muted">
                @{member.handle}
                {member.goalText ? ` · ${member.goalText}` : ''}
              </p>
              <p className="text-xs text-ink-subtle">{activityLabel(member.lastSeenAt)}</p>
            </div>
          </div>
        ))}
      </Card>

      <InviteCard
        groupId={id}
        groupName={info.name}
        handle={handle}
        onHandleChange={setHandle}
        handleValid={handleValid}
        invite={invite}
      />

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Chat</p>
        <Button
          label="Open chat"
          variant="secondary"
          onClick={() => router.push(`/groups/${id}/chat`)}
        />
      </Card>

      <div className="mb-6 mt-2">
        <Button
          label="Leave group"
          variant="ghost"
          disabled={leave.isPending}
          onClick={() => leave.mutate(id, { onSuccess: () => router.replace('/groups') })}
        />
      </div>
    </Screen>
  );
}

/**
 * Naming the group's Buddy, and — when the viewer is the Buddy — who checks
 * them.
 *
 * The second picker is shown only to the Buddy, because it is theirs to answer:
 * nobody may approve their own task, so a single verifier needs somebody
 * verifying *them*, and the person best placed to choose is the one being
 * checked. Left unset it falls back to any member, which is stated rather than
 * left to be discovered.
 */
function BuddyCard({
  group,
  members,
  viewerId,
}: {
  group: GroupDetail;
  members: GroupMember[];
  viewerId: string;
}) {
  const setBuddy = useSetGroupBuddy(group.id);
  const buddy = members.find((m) => m.id === group.buddyUserId);
  const viewerIsBuddy = viewerId === group.buddyUserId;

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-ink-muted">Who verifies tasks</p>
      <p className="mb-3 text-sm text-ink-muted">
        {buddy
          ? `${buddy.displayName} reviews everyone's tasks. ${
              members.length > 2
                ? `Their own are checked by ${verifierFor(group, members, buddy.id)}.`
                : ''
            }`
          : 'Anyone in the group can review anyone else. Name a Buddy to make one person responsible.'}
      </p>

      <PersonPicker
        label="Buddy"
        members={members}
        selectedId={group.buddyUserId}
        onSelect={(id) =>
          setBuddy.mutate({
            buddyUserId: id,
            // Changing the Buddy clears the old nominee: it was that person's
            // choice about their own work, not a property of the group.
            verifierUserId: id === group.buddyUserId ? group.buddyVerifierId : null,
          })
        }
      />

      {viewerIsBuddy && members.length > 2 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-ink-subtle">
            You review everyone. Pick who reviews you — otherwise anyone can.
          </p>
          <PersonPicker
            label="Who checks you"
            members={members.filter((m) => m.id !== group.buddyUserId)}
            selectedId={group.buddyVerifierId}
            onSelect={(id) =>
              setBuddy.mutate({ buddyUserId: group.buddyUserId, verifierUserId: id })
            }
          />
        </div>
      ) : null}

      <ErrorText message={setBuddy.error?.message} />
    </Card>
  );
}

function PersonPicker({
  label,
  members,
  selectedId,
  onSelect,
}: {
  label: string;
  members: GroupMember[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-row flex-wrap gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={selectedId === null}
        onClick={() => onSelect(null)}
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
          selectedId === null
            ? 'border-brand bg-brand font-semibold text-brand-fg'
            : 'border-surface-border bg-surface text-ink hover:border-brand'
        }`}
      >
        Anyone
      </button>
      {members.map((member) => {
        const active = member.id === selectedId;
        return (
          <button
            key={member.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(member.id)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'border-brand bg-brand font-semibold text-brand-fg'
                : 'border-surface-border bg-surface text-ink hover:border-brand'
            }`}
          >
            {member.displayName}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Two ways in: a handle for someone already on Buddy, and a link for someone who
 * is not.
 *
 * The link is the one that matters for a group that wants to grow — a handle can
 * only name somebody who already signed up, which made every group a closed room.
 */
function InviteCard({
  groupId,
  groupName,
  handle,
  onHandleChange,
  handleValid,
  invite,
}: {
  groupId: string;
  groupName: string;
  handle: string;
  onHandleChange: (value: string) => void;
  handleValid: boolean;
  invite: ReturnType<typeof useInviteToGroup>;
}) {
  const createLink = useCreateInviteLink(groupId);
  const [link, setLink] = useState<string | null>(null);

  return (
    <Card>
      <p className="mb-2 text-sm font-semibold text-ink-muted">Invite someone</p>

      {link ? (
        <SharePanel url={link} groupName={groupName} />
      ) : (
        <>
          <Button
            label={createLink.isPending ? 'Making a link…' : 'Invite by link'}
            loading={createLink.isPending}
            onClick={() =>
              createLink.mutate(undefined, {
                onSuccess: (result) =>
                  setLink(`${window.location.origin}/join/${result.token}`),
              })
            }
          />
          <p className="mt-1 text-xs text-ink-subtle">
            Send it on WhatsApp, Telegram or anywhere else. They can join even if they have never
            used Buddy.
          </p>
          <ErrorText message={createLink.error?.message} />
        </>
      )}

      <div className="mt-4 border-t border-surface-border pt-4">
        <Field
          label="Or invite by @handle"
          value={handle}
          onChangeText={(value) => onHandleChange(value.replace(/[^A-Za-z0-9_]/g, ''))}
          autoCapitalize="none"
          placeholder="theirhandle"
        />
        <ErrorText message={invite.error?.message} />
        {invite.isSuccess ? (
          <p className="text-sm text-success">Invite sent to @{invite.data.handle}</p>
        ) : null}
        <div className="mt-3">
          <Button
            label="Send invite"
            variant="secondary"
            disabled={!handleValid || invite.isPending}
            loading={invite.isPending}
            onClick={() => invite.mutate(handle, { onSuccess: () => onHandleChange('') })}
          />
        </div>
      </div>
    </Card>
  );
}
