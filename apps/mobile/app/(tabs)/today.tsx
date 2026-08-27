import { Text, View } from 'react-native';

import { useApiHealth } from '@/api/health';
import { Card, Screen } from '@/components';

/**
 * Phase 0 placeholder for the Today tab (§5.2).
 *
 * It calls the real API through the typed client so the end-to-end chain —
 * Hono route -> AppType -> hc client -> TanStack Query -> screen — is exercised
 * rather than merely wired. Start the Worker with `npm run dev:api` and this
 * shows its status; with the Worker down it shows the error path.
 */
export default function Today() {
  const health = useApiHealth();

  return (
    <Screen>
      <Text className="mb-4 mt-2 text-2xl font-bold text-ink">Today</Text>

      <Card className="mb-3">
        <View className="gap-1">
          <Text className="text-base text-ink">
            Your tasks for today, and your buddies&apos; tasks to review.
          </Text>
          <Text className="text-sm text-ink-subtle">Built out in phase 3.</Text>
        </View>
      </Card>

      <Card>
        <Text className="mb-1 text-sm font-semibold text-ink-muted">API</Text>
        {health.isPending ? (
          <Text className="text-base text-ink-subtle">Checking…</Text>
        ) : health.isError ? (
          <Text className="text-base text-danger">Not reachable</Text>
        ) : (
          <Text className="text-base text-success">
            {health.data.status} · {health.data.environment}
          </Text>
        )}
      </Card>
    </Screen>
  );
}
