import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { MAX_REPORT_NOTE } from '@buddy/shared';

import { useReport } from '@/api/board';

import { Button } from './Button';
import { ErrorText } from './ErrorText';
import { Field } from './Field';

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
  targetType: 'task' | 'message' | 'user';
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="gap-3 rounded-t-3xl bg-surface p-5">
          <Text className="text-xl font-bold text-ink">Report {targetLabel}</Text>

          {report.isSuccess ? (
            <>
              <Text className="text-base text-ink">
                Thanks — this has been sent for review.
              </Text>
              <Button label="Done" onPress={close} />
            </>
          ) : (
            <>
              <Text className="text-sm text-ink-muted">Why are you reporting this?</Text>
              <View className="gap-2">
                {REASONS.map((option) => {
                  const active = option === reason;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setReason(option)}
                      className={`rounded-xl border px-4 py-3 ${
                        active ? 'border-brand bg-brand-muted' : 'border-surface-border'
                      }`}
                    >
                      <Text className={`text-base ${active ? 'font-semibold text-brand' : 'text-ink'}`}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Field
                label="Anything to add? (optional)"
                value={note}
                onChangeText={setNote}
                maxLength={MAX_REPORT_NOTE}
                multiline
              />

              <ErrorText message={report.error?.message} />

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Send report"
                    disabled={reason === null || report.isPending}
                    loading={report.isPending}
                    onPress={() =>
                      report.mutate({
                        targetType,
                        targetId,
                        reason: reason!,
                        ...(note.trim() ? { note: note.trim() } : {}),
                      })
                    }
                  />
                </View>
                <View className="flex-1">
                  <Button label="Cancel" variant="ghost" onPress={close} />
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
