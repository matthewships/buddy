import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { MAX_PROOF_TEXT, MAX_REVIEW_COMMENT, MAX_TASK_TITLE } from '@buddy/shared';

import { useGroups } from '@/api/groups';
import {
  localToday,
  useCreateTask,
  useDeleteTask,
  useMarkDone,
  useMyTasks,
  useReviewQueue,
  useReviewTask,
  useSubmitProof,
  type Task,
} from '@/api/tasks';
import {
  Button,
  Card,
  ErrorText,
  Field,
  RatingPicker,
  ReportSheet,
  Screen,
  TaskRow,
} from '@/components';

/**
 * The Today tab (§5.2) — the screen the product exists for.
 *
 * Two lists: the user's own tasks for their local day, and buddies' tasks
 * waiting on a review. The review queue is one request across all groups
 * (`?scope=review`), not one per group.
 */
export default function Today() {
  const date = localToday();
  const groups = useGroups();
  const mine = useMyTasks(date);
  const queue = useReviewQueue();

  const loading = mine.isPending || groups.isPending;

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-3 pb-8"
        refreshing={mine.isRefetching}
        onScrollBeginDrag={() => undefined}
      >
        <Text className="mb-1 mt-2 text-2xl font-bold text-ink">Today</Text>

        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator />
          </View>
        ) : (groups.data?.groups.length ?? 0) === 0 ? (
          <Card>
            <Text className="text-base text-ink">You need a group before you can plan a day.</Text>
            <Text className="mt-1 text-sm text-ink-subtle">
              Find a buddy in the Buddies tab, or create a group and invite someone you know.
            </Text>
          </Card>
        ) : (
          <>
            <AddTask date={date} />

            {(mine.data?.tasks.length ?? 0) === 0 ? (
              <Card>
                <Text className="text-base text-ink">Nothing planned yet.</Text>
                <Text className="mt-1 text-sm text-ink-subtle">
                  Write down what you&apos;ll finish today. Anything still planned at midnight is
                  marked missed.
                </Text>
              </Card>
            ) : (
              mine.data!.tasks.map((task) => <MyTask key={task.id} task={task} />)
            )}

            {(queue.data?.tasks.length ?? 0) > 0 ? (
              <>
                <Text className="mt-4 text-lg font-bold text-ink">To review</Text>
                {queue.data!.tasks.map((task) => (
                  <ReviewTask key={task.id} task={task} />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function AddTask({ date }: { date: string }) {
  const groups = useGroups();
  const createTask = useCreateTask();

  const [title, setTitle] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);

  const available = groups.data?.groups ?? [];
  const target = groupId ?? available[0]?.id ?? null;
  const canAdd = title.trim().length > 0 && target !== null && !createTask.isPending;

  return (
    <Card>
      <Field
        label="Add a task for today"
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_TASK_TITLE}
        placeholder="Read 20 pages of the textbook"
        returnKeyType="done"
        onSubmitEditing={() => {
          if (canAdd) submit();
        }}
      />

      {available.length > 1 ? (
        <View className="mt-3 gap-2">
          <Text className="text-sm font-medium text-ink-muted">Group</Text>
          <View className="flex-row flex-wrap gap-2">
            {available.map((group) => {
              const active = group.id === target;
              return (
                <Button
                  key={group.id}
                  label={group.name}
                  variant={active ? 'primary' : 'ghost'}
                  onPress={() => setGroupId(group.id)}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      <ErrorText message={createTask.error?.message} />

      <View className="mt-3">
        <Button label="Add task" disabled={!canAdd} loading={createTask.isPending} onPress={submit} />
      </View>
    </Card>
  );

  function submit() {
    if (!target) return;
    createTask.mutate(
      { groupId: target, title: title.trim(), dueDate: date },
      { onSuccess: () => setTitle('') },
    );
  }
}

/** One of the user's own tasks, with the actions available in its current state. */
function MyTask({ task }: { task: Task }) {
  const markDone = useMarkDone();
  const submitProof = useSubmitProof();
  const deleteTask = useDeleteTask();

  const [proof, setProof] = useState('');
  const [expanded, setExpanded] = useState(false);

  return (
    <TaskRow task={task}>
      {task.status === 'planned' || task.status === 'missed' ? (
        <View className="gap-2">
          {expanded ? (
            <Field
              label="What did you do? (optional)"
              value={proof}
              onChangeText={setProof}
              maxLength={MAX_PROOF_TEXT}
              multiline
              placeholder="Chapters 1-2, notes written up"
            />
          ) : null}
          <ErrorText message={markDone.error?.message} />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label={expanded ? 'Submit as done' : 'Mark done'}
                loading={markDone.isPending}
                onPress={() => {
                  if (!expanded) {
                    setExpanded(true);
                    return;
                  }
                  markDone.mutate({
                    id: task.id,
                    ...(proof.trim() ? { proofText: proof.trim() } : {}),
                  });
                }}
              />
            </View>
            {task.status === 'planned' ? (
              <Button
                label="Delete"
                variant="ghost"
                disabled={deleteTask.isPending}
                onPress={() => deleteTask.mutate(task.id)}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {task.status === 'proof_requested' ? (
        <View className="gap-2">
          <Text className="text-sm text-warning">
            Your buddy asked for a bit more detail before approving.
          </Text>
          <Field
            label="Proof"
            value={proof}
            onChangeText={setProof}
            maxLength={MAX_PROOF_TEXT}
            multiline
            placeholder="What exactly did you finish?"
          />
          <ErrorText message={submitProof.error?.message} />
          <Button
            label="Send proof"
            disabled={proof.trim().length === 0 || submitProof.isPending}
            loading={submitProof.isPending}
            onPress={() => submitProof.mutate({ id: task.id, proofText: proof.trim() })}
          />
        </View>
      ) : null}

      {task.status === 'done' ? (
        <Text className="text-sm text-ink-muted">
          Waiting for a buddy in {task.groupName} to review it.
        </Text>
      ) : null}
    </TaskRow>
  );
}

/** A buddy's task, with the approve / request-proof actions (§2.4). */
function ReviewTask({ task }: { task: Task }) {
  const review = useReviewTask();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'idle' | 'approving'>('idle');
  const [reporting, setReporting] = useState(false);

  const award = review.data?.award;

  if (review.isSuccess && award) {
    return (
      <Card className="border-success">
        <Text className="text-base font-semibold text-ink">Reviewed · {task.title}</Text>
        <Text className="mt-1 text-sm text-ink-muted">
          {task.ownerDisplayName} earned {award.credits + award.dailyBonus} credits
          {award.dailyBonus > 0 ? ' (day complete)' : ''} · {award.streak} day streak
        </Text>
      </Card>
    );
  }

  return (
    <TaskRow task={task} showOwner>
      {mode === 'idle' ? (
        <View className="gap-2">
          <ErrorText message={review.error?.message} />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Approve" onPress={() => setMode('approving')} />
            </View>
            <View className="flex-1">
              <Button
                label="Ask for proof"
                variant="ghost"
                loading={review.isPending}
                onPress={() =>
                  review.mutate({
                    id: task.id,
                    action: 'request_proof',
                    ...(comment.trim() ? { comment: comment.trim() } : {}),
                  })
                }
              />
            </View>
          </View>
          {/* Reporting sits behind the review actions: it is the escalation for
              a task that is not merely unproven but dishonest (§2.6). */}
          <Pressable accessibilityRole="button" onPress={() => setReporting(true)}>
            <Text className="text-center text-xs text-ink-subtle">Report this task</Text>
          </Pressable>
          <ReportSheet
            visible={reporting}
            onClose={() => setReporting(false)}
            targetType="task"
            targetId={task.id}
            targetLabel="this task"
          />
        </View>
      ) : (
        <View className="gap-3">
          <Text className="text-sm font-medium text-ink-muted">How well was it done?</Text>
          <RatingPicker value={rating} onChange={setRating} />
          <Field
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            maxLength={MAX_REVIEW_COMMENT}
            placeholder="Solid work"
          />
          <ErrorText message={review.error?.message} />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label="Confirm"
                disabled={rating === null || review.isPending}
                loading={review.isPending}
                onPress={() =>
                  review.mutate({
                    id: task.id,
                    action: 'approve',
                    rating: rating!,
                    ...(comment.trim() ? { comment: comment.trim() } : {}),
                  })
                }
              />
            </View>
            <View className="flex-1">
              <Button label="Back" variant="ghost" onPress={() => setMode('idle')} />
            </View>
          </View>
        </View>
      )}
    </TaskRow>
  );
}
