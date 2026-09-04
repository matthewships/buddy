'use client';

import { useEffect, useState } from 'react';

import { SESSION_LENGTHS } from '@buddy/shared';

import {
  useCancelSession,
  useCreateSession,
  useCurrentSession,
  useEndSession,
  useHeartbeat,
  useJoinSession,
  useLeaveSession,
  useStartSession,
  type SessionParticipant,
} from '@/api/sessions';
import { serverNow } from '@/hooks/useCountdown';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { ErrorText } from './ErrorText';
import { formatClock } from './TaskClock';

/**
 * The group's session (PRODUCT.md §3.1): one clock for the room.
 *
 * Three states, one panel. Nothing running: the three lengths, one tap each,
 * because a session is started far more often than it is configured. Waiting:
 * who has committed, and the host's Start. Running: the shared clock, who is
 * present, and the way out. While the viewer is present the panel beats once a
 * minute so the server knows they are still there; the chat lock reads that.
 */
export function SessionPanel({
  groupId,
  viewerId,
  memberCount,
}: {
  groupId: string;
  viewerId: string;
  memberCount: number;
}) {
  const current = useCurrentSession(groupId);
  const create = useCreateSession(groupId);
  const join = useJoinSession(groupId);
  const leave = useLeaveSession(groupId);
  const start = useStartSession(groupId);
  const end = useEndSession(groupId);
  const cancel = useCancelSession(groupId);

  const view = current.data;
  const session = view?.session ?? null;
  const me = view?.participants.find((p) => p.userId === viewerId);
  const present = me?.state === 'present' || me?.state === 'late';
  const isHost = session?.hostId === viewerId;

  useHeartbeat(session?.state === 'live' ? session.id : null, present);

  const error =
    create.error?.message ??
    join.error?.message ??
    leave.error?.message ??
    start.error?.message ??
    end.error?.message ??
    cancel.error?.message;

  if (!session || session.state === 'ended' || session.state === 'cancelled') {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
        <div className="flex flex-row items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Work together</h2>
          <span className="text-xs text-ink-subtle">
            {memberCount > 1 ? 'One clock for the room' : 'Invite someone to share it'}
          </span>
        </div>
        <div className="flex flex-row gap-2">
          {SESSION_LENGTHS.map((minutes) => (
            <Button
              key={minutes}
              label={`${minutes} min`}
              variant="secondary"
              className="flex-1"
              loading={create.isPending && create.variables?.plannedMinutes === minutes}
              disabled={create.isPending}
              onClick={() => create.mutate({ plannedMinutes: minutes })}
            />
          ))}
        </div>
        <p className="text-xs text-ink-subtle">
          Everyone who joins is out of the chat until it ends. Start a task while you are in it and
          its clock joins the session.
        </p>
        <ErrorText message={error} />
      </section>
    );
  }

  if (session.state === 'scheduled') {
    const at = session.scheduledFor ? new Date(session.scheduledFor) : null;
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
        <div className="flex flex-row items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">
            {session.plannedMinutes}-minute session
            {at ? ` at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </h2>
          <span className="text-xs text-ink-subtle">{view!.participants.length} committed</span>
        </div>
        <Faces participants={view!.participants} viewerId={viewerId} />
        <div className="flex flex-row gap-2">
          {me ? (
            <Button
              label="Pull out"
              variant="ghost"
              className="flex-1"
              loading={leave.isPending}
              onClick={() => leave.mutate(session.id)}
            />
          ) : (
            <Button
              label="Commit"
              variant="primary"
              className="flex-1"
              loading={join.isPending}
              onClick={() => join.mutate({ sessionId: session.id })}
            />
          )}
          {isHost ? (
            <>
              <Button
                label="Start now"
                variant="primary"
                className="flex-1"
                loading={start.isPending}
                onClick={() => start.mutate(session.id)}
              />
              <Button
                label="Cancel"
                variant="ghost"
                className="w-auto"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(session.id)}
              />
            </>
          ) : null}
        </div>
        <ErrorText message={error} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-brand bg-brand-muted p-4">
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-ink">
            Session running · {session.plannedMinutes} min
          </h2>
          <span className="text-xs text-ink-muted">
            {present ? 'You are in it. Chat opens when it ends.' : 'Join and your chat closes until it ends.'}
          </span>
        </div>
        <SharedClock startedAt={session.startedAt ?? view!.serverNow} plannedMinutes={session.plannedMinutes} />
      </div>
      <Faces participants={view!.participants} viewerId={viewerId} live />
      <div className="flex flex-row gap-2">
        {present ? (
          <Button
            label="Leave"
            variant="ghost"
            className="flex-1"
            loading={leave.isPending}
            onClick={() => leave.mutate(session.id)}
          />
        ) : (
          <Button
            label="Join"
            variant="primary"
            className="flex-1"
            loading={join.isPending}
            onClick={() => join.mutate({ sessionId: session.id })}
          />
        )}
        {isHost ? (
          <Button
            label="End for everyone"
            variant="secondary"
            className="flex-1"
            loading={end.isPending}
            onClick={() => end.mutate(session.id)}
          />
        ) : null}
      </div>
      <ErrorText message={error} />
    </section>
  );
}

/** The people in it, with a state word each. */
function Faces({
  participants,
  viewerId,
  live = false,
}: {
  participants: SessionParticipant[];
  viewerId: string;
  live?: boolean;
}) {
  const word = (p: SessionParticipant) => {
    switch (p.state) {
      case 'present':
        return live && p.joinedAt ? `${Math.max(0, Math.floor((serverNow() - Date.parse(p.joinedAt)) / 60_000))} min in` : 'in';
      case 'late':
        return 'late';
      case 'committed':
        return 'committed';
      case 'left_early':
        return 'left';
      case 'no_show':
        return 'absent';
      case 'completed':
        return 'done';
    }
  };
  return (
    <ul className="flex flex-row flex-wrap gap-2">
      {participants.map((p) => (
        <li
          key={p.userId}
          className={`flex flex-row items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs ${
            p.state === 'present' || p.state === 'late'
              ? 'border-brand bg-surface text-ink'
              : 'border-surface-border bg-surface text-ink-muted'
          }`}
        >
          <Avatar avatarKey={p.avatarKey} displayName={p.displayName} size={22} />
          <span className="font-semibold">{p.userId === viewerId ? 'You' : p.displayName.split(' ')[0]}</span>
          <span className="text-ink-subtle">{word(p)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Counts down from the plan, and up past it, on the server's clock. */
function SharedClock({ startedAt, plannedMinutes }: { startedAt: string; plannedMinutes: number }) {
  const target = Date.parse(startedAt) + plannedMinutes * 60_000;
  const [remaining, setRemaining] = useState(() => target - serverNow());
  useEffect(() => {
    const tick = () => setRemaining(target - serverNow());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);
  const over = remaining < 0;
  return (
    <span
      aria-live="polite"
      className={`font-display text-2xl font-bold tabular-nums ${over ? 'text-warning' : 'text-brand'}`}
    >
      {over ? `+${formatClock(-remaining)}` : formatClock(remaining)}
    </span>
  );
}
