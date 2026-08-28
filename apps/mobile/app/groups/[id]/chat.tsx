import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MAX_MESSAGE_BODY } from '@buddy/shared';

import { useChatHistory, type ChatMessage } from '@/api/chat';
import { useMe } from '@/api/auth';
import { useChatSocket } from '@/chat/useChatSocket';
import { Screen } from '@/components';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const history = useChatHistory(id);
  const socket = useChatSocket(id);

  const [draft, setDraft] = useState('');

  // The API returns newest-first and an inverted list renders newest at the
  // bottom, so the flattened order is used as-is.
  const messages = useMemo(
    () => history.data?.pages.flatMap((page) => page.messages) ?? [],
    [history.data],
  );

  const canSend = draft.trim().length > 0 && socket.status === 'open';

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    // The socket echoes the stored message back, so there is no optimistic
    // insert to reconcile — the server assigns the id and timestamp.
    if (socket.send(body)) setDraft('');
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-row items-center justify-between py-2">
          <Text className="text-2xl font-bold text-ink">Chat</Text>
          <ConnectionPill status={socket.status} onRetry={socket.retry} />
        </View>

        {history.isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerClassName="gap-2 py-2"
            onEndReached={() => {
              if (history.hasNextPage && !history.isFetchingNextPage) {
                void history.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.3}
            renderItem={({ item }) => (
              <Bubble message={item} mine={item.senderId === me.data?.id} />
            )}
            ListEmptyComponent={
              <View className="py-8">
                <Text className="text-center text-base text-ink-subtle">
                  No messages yet. Say hello.
                </Text>
              </View>
            }
          />
        )}

        <View className="flex-row items-end gap-2 border-t border-surface-border py-3">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={socket.status === 'open' ? 'Message' : 'Reconnecting…'}
            placeholderTextColor="#94a3b8"
            editable={socket.status === 'open'}
            multiline
            maxLength={MAX_MESSAGE_BODY}
            accessibilityLabel="Message"
            className="max-h-28 flex-1 rounded-2xl border border-surface-border bg-surface px-4 py-3 text-base text-ink"
            onSubmitEditing={send}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={send}
            className={`h-12 items-center justify-center rounded-2xl px-5 ${
              canSend ? 'bg-brand' : 'bg-surface-border'
            }`}
          >
            <Text className={`font-semibold ${canSend ? 'text-brand-fg' : 'text-ink-subtle'}`}>
              Send
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <View className={`max-w-[80%] ${mine ? 'self-end' : 'self-start'}`}>
      {!mine ? (
        <Text className="mb-0.5 text-xs text-ink-subtle">{message.senderDisplayName}</Text>
      ) : null}
      <View
        className={`rounded-2xl px-4 py-2.5 ${
          mine ? 'bg-brand' : 'border border-surface-border bg-surface'
        }`}
      >
        <Text className={`text-base ${mine ? 'text-brand-fg' : 'text-ink'}`}>{message.body}</Text>
      </View>
      <Text className={`mt-0.5 text-xs text-ink-subtle ${mine ? 'text-right' : ''}`}>
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

function ConnectionPill({
  status,
  onRetry,
}: {
  status: 'connecting' | 'open' | 'closed';
  onRetry: () => void;
}) {
  if (status === 'open') {
    return (
      <View className="flex-row items-center gap-1.5">
        <View className="h-2 w-2 rounded-full bg-success" />
        <Text className="text-xs text-ink-subtle">Live</Text>
      </View>
    );
  }

  if (status === 'connecting') {
    return <Text className="text-xs text-ink-subtle">Connecting…</Text>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onRetry}>
      <Text className="text-xs font-semibold text-brand">Disconnected · Retry</Text>
    </Pressable>
  );
}
