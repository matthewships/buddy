'use client';

import { useState } from 'react';

import { MAX_REPORT_NOTE, type ReportTarget } from '@buddy/shared';

import { useReport } from '@/api/board';

import { Button } from './Button';
import { ErrorText } from './ErrorText';
import { Field } from './Field';
import { Sheet } from './Sheet';

/**
 * Reporting a task, message or user (§2.6).
 *
 * The reasons are a fixed list rather than free text so the admin queue is
 * sortable, with a note for anything the list doesn't cover. A repeat report is
 * reported back as success, matching the API — the person did what they meant
 * to, and telling them "already reported" as an error would be confusing.
 */
const REASONS = [
  'Task was not actually done',
  'Proof is fake or unrelated',
  // Distinct from "fake or unrelated": that one disputes the work, this one is
  // about the picture itself, and the two need different handling in the queue.
  'Photo is inappropriate or explicit',
  'Abusive or harassing',
  'Spam',
  'Something else',
] as const;

export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  targetLabel,
}: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  targetLabel: string;
}) {
  const report = useReport();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const close = () => {
    setReason(null);
    setNote('');
    report.reset();
    onClose();
  };

  return (
    <Sheet open={visible} onClose={close} title={`Report ${targetLabel}`}>
      <h2 className="text-xl font-bold text-ink">Report {targetLabel}</h2>

      {report.isSuccess ? (
        <>
          <p className="text-base text-ink">Thanks — this has been sent for review.</p>
          <Button label="Done" onClick={close} />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">Why are you reporting this?</p>
          <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-2">
            {REASONS.map((option) => {
              const active = option === reason;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setReason(option)}
                  className={`cursor-pointer rounded-md border px-4 py-3 text-left text-base transition-colors ${
                    active
                      ? 'border-brand bg-brand-muted font-semibold text-brand'
                      : 'border-surface-border text-ink hover:border-brand'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <Field
            label="Anything to add? (optional)"
            value={note}
            onChangeText={setNote}
            maxLength={MAX_REPORT_NOTE}
            multiline
            rows={3}
          />

          <ErrorText message={report.error?.message} />

          <div className="flex flex-row gap-2">
            <Button
              label="Send report"
              className="flex-1"
              disabled={reason === null || report.isPending}
              loading={report.isPending}
              onClick={() => {
                if (reason === null) return;
                report.mutate({
                  targetType,
                  targetId,
                  reason,
                  ...(note.trim() ? { note: note.trim() } : {}),
                });
              }}
            />
            <Button label="Cancel" variant="ghost" className="flex-1" onClick={close} />
          </div>
        </>
      )}
    </Sheet>
  );
}
