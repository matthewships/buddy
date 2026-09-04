'use client';

import { useEffect, useState } from 'react';

import { CHECKIN_REPLIES, NUDGE_TEMPLATES, START_NUDGE_LEAD_MINUTES, nudgeText } from '@buddy/shared';

import type { GroupMember } from '@/api/groups';
import { useNudgeTask, useReplyCheckin, useRequestCheckin, type TaskNudge } from '@/api/nudges';
import { serverNow } from '@/hooks/useCountdown';

import { Button } from './Button';
import { ErrorText } from './ErrorText';

/**
 * The latest start (PRODUCT.md §3.1), as a countdown on a task that has not
 * been started. Derived by the server from the owner's midnight and the
 * estimate; this only says it, and changes tone as it runs out.
 */
export function StartByLabel({ at }: { at: string | null }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!at) return null;

  const msLeft = Date.parse(at) - now;
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (msLeft < 0) return <span className="font-semibold text-warning">Won’t fit today</span>;
  if (msLeft < START_NUDGE_LEAD_MINUTES * 60_000) {
    return <span className="font-semibold text-warning">Start by {time} · running out</span>;
  }
  return <span className="text-ink-subtle">Start by {time}</span>;
}

/** A groupmate's nudge: four lines, one tap (PRODUCT.md §3.3). */
export function NudgeButtons({ taskId }: { taskId: string }) {
  const nudge = useNudgeTask(taskId);
  const [open, setOpen] = useState(false);

  if (nudge.isSuccess) {
    return <p className="text-xs text-success">Nudged: “{nudgeText(nudge.data.template)}”</p>;
  }
  if (!open) {
    return (
      <Button label="Nudge" variant="secondary" className="w-auto self-start" onClick={() => setOpen(true)} />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row flex-wrap gap-2">
        {NUDGE_TEMPLATES.map((t) => (
          <Button
            key={t.key}
            label={t.text}
            variant="ghost"
            className="w-auto"
            loading={nudge.isPending && nudge.variables === t.key}
            disabled={nudge.isPending}
            onClick={() => nudge.mutate(t.key)}
          />
        ))}
      </div>
      <ErrorText message={nudge.error?.message} />
    </div>
  );
}

/**
 * "Check on me at 7:15": the owner picks a groupmate and a time (PRODUCT.md
 * §3.3). Owner-initiated by construction, which is what keeps it opt-in.
 */
export function CheckinRequest({
  taskId,
  members,
  viewerId,
}: {
  taskId: string;
  members: GroupMember[];
  viewerId: string;
}) {
  const request = useRequestCheckin(taskId);
  const [open, setOpen] = useState(false);
  const [buddyId, setBuddyId] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const others = members.filter((m) => m.id !== viewerId);

  if (others.length === 0) return null;
  if (request.isSuccess) {
    return (
      <p className="text-xs text-success">
        {others.find((m) => m.id === request.variables?.buddyUserId)?.displayName ?? 'They'} will check on you at{' '}
        {new Date(request.data.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
      </p>
    );
  }
  if (!open) {
    return (
      <Button
        label="Ask someone to check on me"
        variant="ghost"
        className="w-auto self-start"
        onClick={() => setOpen(true)}
      />
    );
  }

  const submit = () => {
    if (!buddyId || !time) return;
    const [hh, mm] = time.split(':').map(Number);
    const at = new Date();
    at.setHours(hh ?? 0, mm ?? 0, 0, 0);
    request.mutate({ buddyUserId: buddyId, at: at.toISOString() });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-surface-border bg-surface-muted p-3">
      <p className="text-xs text-ink-muted">Who should check, and when? They get one push at that time.</p>
      <div className="flex flex-row flex-wrap gap-2">
        {others.map((m) => (
          <Button
            key={m.id}
            label={m.displayName}
            variant={buddyId === m.id ? 'primary' : 'ghost'}
            className="w-auto"
            onClick={() => setBuddyId(m.id)}
          />
        ))}
      </div>
      <div className="flex flex-row items-center gap-2">
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          aria-label="Time to check"
          className="h-10 rounded-md border border-surface-border bg-surface px-2 text-base text-ink"
        />
        <Button
          label="Ask"
          variant="primary"
          className="w-auto"
          disabled={!buddyId || !time}
          loading={request.isPending}
          onClick={submit}
        />
        <Button label="Cancel" variant="ghost" className="w-auto" onClick={() => setOpen(false)} />
      </div>
      <ErrorText message={request.error?.message} />
    </div>
  );
}

/** What has been said about a task: nudges received, check-ins asked and answered. */
export function NudgeLog({ nudges, viewerId }: { nudges: TaskNudge[]; viewerId: string }) {
  const lines = nudges.filter((n) => n.kind !== 'start' || n.toUserId === viewerId);
  if (lines.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {lines.slice(0, 3).map((n) => (
        <li key={n.id} className="text-xs text-ink-muted">
          {n.kind === 'start'
            ? 'Buddy: start by the time on the left to finish today.'
            : n.kind === 'checkin'
              ? `${n.fromDisplayName ?? 'A buddy'} ${n.sentAt ? 'was asked to check' : 'will check'} at ${
                  n.scheduledFor ? new Date(n.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                }`
              : `${n.fromDisplayName ?? 'Someone'}: “${nudgeText(n.template ?? '')}”`}
        </li>
      ))}
    </ul>
  );
}

/** The buddy who was asked to check answers with one of three lines, once. */
export function CheckinReply({ taskId, checkin }: { taskId: string; checkin: TaskNudge }) {
  const reply = useReplyCheckin(taskId);
  if (reply.isSuccess) {
    return <p className="text-xs text-success">Sent: “{nudgeText(reply.data.template)}”</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-brand bg-brand-muted p-3">
      <p className="text-xs font-semibold text-ink">They asked you to check on them now.</p>
      <div className="flex flex-row flex-wrap gap-2">
        {CHECKIN_REPLIES.map((t) => (
          <Button
            key={t.key}
            label={t.text}
            variant="ghost"
            className="w-auto"
            loading={reply.isPending && reply.variables?.template === t.key}
            disabled={reply.isPending}
            onClick={() => reply.mutate({ nudgeId: checkin.id, template: t.key })}
          />
        ))}
      </div>
      <ErrorText message={reply.error?.message} />
    </div>
  );
}
