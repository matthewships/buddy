'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { LEAVE_REASONS, handleSchema } from '@buddy/shared';

import { useMe } from '@/api/auth';
import type { LeaderboardScope } from '@/api/board';
import {
  useCreateInviteLink,
  useGroup,
  useGroupStandings,
  useInviteToGroup,
  useLeaveGroup,
  useMuteGroup,
  useSetGroupBuddy,
  type GroupDetail,
  type GroupMember,
} from '@/api/groups';
import {
  Avatar,
  BackLink,
  Button,
  Chips,
  ErrorText,
  Field,
  GroupTasks,
  IconButton,
  Screen,
  SharePanel,
  Sheet,
  Spinner,
  Toggle,
} from '@/components';
import { verifierFor } from '@/lib/review-rights';

/**
 * One group: who is in it, and what they said they would do today.
 *
 * The screen used to be five stacked cards — tasks, the Buddy rule, members,
 * invite, chat — each permanently open, so the thing people come here for
 * (today's tasks) got a fifth of the screen and everything else was a wall to
 * scroll past. Only two of those are things you *read*: the people and the
 * work. The rest are things you *do* once in a while, so they became actions in
 * the header that open when asked and take no room until then.
 */
export default function GroupDetailPage() {
  const router = useRouter();
  const id = useParams<{ id: string }>().id;

  const me = useMe();
  const group = useGroup(id);
  const [inviting, setInviting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);

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
      <div className="flex flex-row items-center justify-between gap-2">
        <BackLink fallback="/groups" label="Groups" />
        <div className="flex flex-row items-center gap-1">
          <IconButton
            label="Open chat"
            onClick={() => router.push(`/groups/${id}/chat`)}
            glyph={
              // A speech bubble, drawn rather than typed: an emoji renders at a
              // different size and weight on every platform, and this sits
              // beside another icon that has to match it.
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path
                  d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5Z"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <IconButton
            label="Group standings"
            onClick={() => setStandingsOpen(true)}
            glyph={
              // Three bars of unequal height. A trophy would promise a winner;
              // this is a comparison, and most weeks nobody has won anything.
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M5 20V13M12 20V5M19 20v-9" strokeLinecap="round" />
              </svg>
            }
          />
          <IconButton
            label="Group settings"
            onClick={() => setSettingsOpen(true)}
            glyph={
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            }
          />
        </div>
      </div>

      <div className="flex flex-col">
        <h1 className="text-2xl font-bold text-ink">
          {info.emoji ? `${info.emoji} ` : ''}
          {info.name}
        </h1>
        <p className="text-sm text-ink-subtle">
          {members.length === 1
            ? // A desk of one (§2.9): nothing here is checked until somebody
              // else is in the room, and the line should say so rather than
              // promise "anyone in the group" to a group that is only you.
              'Just you · nobody checks your work yet'
            : `${members.length} members · checked by ${verifierFor(info, members, viewerId)}`}
        </p>
      </div>

      <GroupTasks
        group={info}
        members={members}
        viewerId={viewerId}
        onInvite={() => setInviting(true)}
      />

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        groupId={id}
        groupName={info.name}
      />

      <StandingsSheet
        open={standingsOpen}
        onClose={() => setStandingsOpen(false)}
        groupId={id}
        viewerId={viewerId}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        group={info}
        members={members}
        viewerId={viewerId}
        onLeft={() => router.replace('/groups')}
      />
    </Screen>
  );
}

/**
 * How this group is doing, side by side.
 *
 * A group board rather than the global one, because the global one answers a
 * question nobody in a two-person group is asking: being 4,312th among
 * strangers says nothing, and being ahead of the person who checks your work
 * says quite a lot.
 *
 * Fetched only while open. It is a panel most people will open occasionally,
 * and paying for it on every visit to the group would be a request per member
 * per page view for a number nobody asked to see.
 */
function StandingsSheet({
  open,
  onClose,
  groupId,
  viewerId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  viewerId: string;
}) {
  // All time first, for the same reason the Board tab defaults to it: a week's
  // figures read as zero for everyone on a Monday.
  const [scope, setScope] = useState<LeaderboardScope>('alltime');
  const standings = useGroupStandings(groupId, scope, open);
  const entries = standings.data?.entries ?? [];

  return (
    <Sheet open={open} onClose={onClose} title="Group standings" placement="side">
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Standings</h2>
        <Button label="Close" variant="ghost" className="w-auto" onClick={onClose} />
      </div>

      <div role="tablist" aria-label="Range" className="flex flex-row gap-2">
        <ScopeTab
          label="All time"
          active={scope === 'alltime'}
          onClick={() => setScope('alltime')}
        />
        <ScopeTab label="This week" active={scope === 'weekly'} onClick={() => setScope('weekly')} />
      </div>

      {standings.isPending ? (
        <div className="flex items-center justify-center py-8 text-ink-subtle">
          <Spinner />
        </div>
      ) : standings.isError ? (
        <p className="py-4 text-sm text-danger">Couldn&apos;t load the standings.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-border">
          {entries.map((entry) => (
            <li
              key={entry.userId}
              className={`flex flex-row items-center gap-3 py-3 ${
                entry.userId === viewerId ? 'font-semibold' : ''
              }`}
            >
              <span className="w-6 shrink-0 text-sm tabular-nums text-ink-subtle">
                {entry.rank}
              </span>
              <Avatar
                avatarKey={entry.avatarKey}
                displayName={entry.displayName}
                size={36}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base text-ink">
                  {entry.displayName}
                  {entry.userId === viewerId ? ' (you)' : ''}
                </span>
                <span className="text-xs text-ink-subtle">
                  {entry.currentStreak > 0 ? `${entry.currentStreak}-day streak` : 'No streak'}
                </span>
              </div>
              <span className="shrink-0 text-base font-semibold tabular-nums text-ink">
                {entry.credits.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/*
        Said plainly rather than left to be inferred from a row of zeros: on a
        board where everybody is on nothing, "nobody is ahead" is the truth and
        "you are joint first" is not.
      */}
      {standings.isSuccess && entries.every((entry) => entry.credits === 0) ? (
        <p className="text-sm text-ink-muted">
          Nobody has earned credits {scope === 'weekly' ? 'this week' : 'yet'}. The first approved
          task starts it.
        </p>
      ) : null}
    </Sheet>
  );
}

function ScopeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand text-brand-fg'
          : 'border-surface-border bg-surface text-ink-muted hover:border-brand hover:text-brand'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Two ways in: a link for someone who is not on Buddy yet, and a handle for
 * someone who is.
 *
 * The link leads because it is the one that grows a group — a handle can only
 * name somebody who already signed up, which made every group a closed room.
 */
function InviteSheet({
  open,
  onClose,
  groupId,
  groupName,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}) {
  const invite = useInviteToGroup(groupId);
  const createLink = useCreateInviteLink(groupId);
  const [link, setLink] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const handleValid = handleSchema.safeParse(handle).success;

  return (
    <Sheet open={open} onClose={onClose} title="Invite someone">
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Invite someone</h2>
        <Button label="Close" variant="ghost" className="w-auto" onClick={onClose} />
      </div>

      {link ? (
        <SharePanel url={link} groupName={groupName} />
      ) : (
        <>
          <Button
            label={createLink.isPending ? 'Making a link…' : 'Invite by link'}
            loading={createLink.isPending}
            onClick={() =>
              createLink.mutate(undefined, {
                onSuccess: (result) => setLink(`${window.location.origin}/join/${result.token}`),
              })
            }
          />
          <p className="text-xs text-ink-subtle">
            Send it on WhatsApp, Telegram or anywhere else. They can join even if they have never
            used Buddy.
          </p>
          <ErrorText message={createLink.error?.message} />
        </>
      )}

      <div className="mt-2 border-t border-surface-border pt-4">
        <Field
          label="Or invite by @handle"
          value={handle}
          onChangeText={(value) => setHandle(value.replace(/[^A-Za-z0-9_]/g, ''))}
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
            onClick={() => invite.mutate(handle, { onSuccess: () => setHandle('') })}
          />
        </div>
      </div>
    </Sheet>
  );
}

/**
 * The settings that used to be permanent cards: who verifies tasks, and the way
 * out of the group.
 *
 * Naming the Buddy is a decision a group makes once, so it belongs behind an
 * action rather than above the work. The second picker is shown only to the
 * Buddy, because it is theirs to answer: nobody may approve their own task, so
 * a single verifier needs somebody verifying *them*, and the person best placed
 * to choose is the one being checked. Left unset it falls back to any member,
 * which is stated rather than left to be discovered.
 *
 * Who may change it is now stated on the screen rather than discovered by
 * being refused. The server lets anyone name the first Buddy and then narrows
 * changes to the group's creator or the Buddy themselves — a rule that exists
 * because the alternative let whoever disliked their review appoint
 * themselves. A picker that silently 403s teaches nobody that; a disabled one
 * with the reason under it does.
 */
function SettingsSheet({
  open,
  onClose,
  group,
  members,
  viewerId,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupDetail;
  members: GroupMember[];
  viewerId: string;
  onLeft: () => void;
}) {
  const setBuddy = useSetGroupBuddy(group.id);
  const leave = useLeaveGroup();
  const mute = useMuteGroup(group.id);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [leaveNote, setLeaveNote] = useState('');

  const buddy = members.find((m) => m.id === group.buddyUserId);
  const viewerIsBuddy = viewerId === group.buddyUserId;
  // Mirrors the server rule in PUT /groups/:id/buddy. The server is still the
  // authority; this only decides what to offer.
  const mayChangeBuddy = !group.buddyUserId || viewerId === group.createdBy || viewerIsBuddy;
  const creator = members.find((m) => m.id === group.createdBy);

  return (
    <Sheet open={open} onClose={onClose} title="Group settings">
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Group settings</h2>
        <Button label="Close" variant="ghost" className="w-auto" onClick={onClose} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-muted">Who verifies tasks</p>
        <p className="text-sm text-ink-muted">
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
          disabled={!mayChangeBuddy}
          onSelect={(id) =>
            setBuddy.mutate({
              buddyUserId: id,
              // Changing the Buddy clears the old nominee: it was that person's
              // choice about their own work, not a property of the group.
              verifierUserId: id === group.buddyUserId ? group.buddyVerifierId : null,
            })
          }
        />

        {!mayChangeBuddy ? (
          <p className="text-xs text-ink-subtle">
            {creator ? `${creator.displayName} made this group, so only they` : 'Only whoever made this group'}
            {' '}or {buddy?.displayName ?? 'the Buddy'} can change this. It is the one setting the
            group cannot quietly opt out of.
          </p>
        ) : !group.buddyUserId ? (
          <p className="text-xs text-ink-subtle">
            Anyone can name the first Buddy. After that only you or they can change it.
          </p>
        ) : null}

        {viewerIsBuddy && members.length > 2 ? (
          <div className="mt-3">
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
      </div>

      {/*
        Muting (PRODUCT.md §6.1): the phone stops buzzing for this group's chat
        and nudges. The room is untouched, and the switch says exactly that.
      */}
      <div className="mt-2 flex flex-row items-center justify-between gap-4 border-t border-surface-border pt-4">
        <div className="flex flex-1 flex-col">
          <p className="text-base font-semibold text-ink">Mute notifications</p>
          <p className="text-sm text-ink-muted">
            {group.muted
              ? 'This group’s chat and nudges no longer notify you.'
              : 'Chat and nudges from this group notify you.'}
          </p>
        </div>
        <Toggle
          checked={group.muted}
          onChange={(value) => {
            if (!mute.isPending) mute.mutate(value);
          }}
          label="Mute notifications"
        />
      </div>
      <ErrorText message={mute.error?.message} />

      {/*
        Leaving, with a reason (PRODUCT.md §6.1). The reason is private — it
        feeds nothing anyone else sees — and optional, because a reason
        demanded is a reason invented.
      */}
      <div className="mt-2 border-t border-surface-border pt-4">
        {confirmingLeave ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">Why are you leaving? Only Buddy sees this.</p>
            <Chips
              label="Reason for leaving"
              options={LEAVE_REASONS}
              selected={leaveReason}
              onSelect={(key) => setLeaveReason(key === leaveReason ? null : key)}
            />
            <Field
              label="Anything else (optional)"
              value={leaveNote}
              onChangeText={setLeaveNote}
              maxLength={600}
              placeholder="A sentence is plenty"
            />
            <div className="flex flex-row gap-2">
              <Button
                label="Leave group"
                variant="danger"
                className="flex-1"
                loading={leave.isPending}
                onClick={() =>
                  leave.mutate(
                    {
                      groupId: group.id,
                      ...(leaveReason ? { reason: leaveReason } : {}),
                      ...(leaveNote.trim() ? { note: leaveNote.trim() } : {}),
                    },
                    { onSuccess: onLeft },
                  )
                }
              />
              <Button
                label="Stay"
                variant="ghost"
                className="flex-1"
                onClick={() => setConfirmingLeave(false)}
              />
            </div>
          </div>
        ) : (
          <Button label="Leave group" variant="ghost" onClick={() => setConfirmingLeave(true)} />
        )}
        <ErrorText message={leave.error?.message} />
      </div>
    </Sheet>
  );
}

/**
 * Choosing a person, with their face on the button.
 *
 * It was a row of name pills, which is a list of strings where the group screen
 * everywhere else shows a row of faces — so picking the Buddy looked nothing
 * like the roster the choice is about, and in a group with two Alexes it was
 * genuinely ambiguous.
 */
function PersonPicker({
  label,
  members,
  selectedId,
  onSelect,
  disabled = false,
}: {
  label: string;
  members: GroupMember[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
}) {
  const base =
    'flex cursor-pointer flex-row items-center gap-2 rounded-full border py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-row flex-wrap gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={selectedId === null}
        disabled={disabled}
        onClick={() => onSelect(null)}
        className={`${base} px-3 text-sm ${
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
            disabled={disabled}
            onClick={() => onSelect(member.id)}
            className={`${base} pl-1 pr-3 text-sm ${
              active
                ? 'border-brand bg-brand font-semibold text-brand-fg'
                : 'border-surface-border bg-surface text-ink hover:border-brand'
            }`}
          >
            <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={24} />
            {member.displayName}
          </button>
        );
      })}
    </div>
  );
}
