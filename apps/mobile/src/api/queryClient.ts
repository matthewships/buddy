import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClient,
  type Persister,
} from '@tanstack/react-query-persist-client';

/**
 * Server state (§5.1). Queries are cached and persisted to AsyncStorage so a
 * cold start paints immediately from the last known data, then revalidates.
 * Nothing sensitive goes here — tokens live in expo-secure-store.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      // Mobile networks drop constantly; refetching on reconnect matters more
      // than refetching on focus.
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});

const asyncStoragePersister: Persister = {
  persistClient: async (client) => {
    await AsyncStorage.setItem('buddy.queryCache', JSON.stringify(client));
  },
  restoreClient: async () => {
    const raw = await AsyncStorage.getItem('buddy.queryCache');
    return raw ? JSON.parse(raw) : undefined;
  },
  removeClient: async () => {
    await AsyncStorage.removeItem('buddy.queryCache');
  },
};

export function startCachePersistence(): void {
  void persistQueryClient({
    queryClient,
    persister: asyncStoragePersister,
    maxAge: 24 * 60 * 60 * 1000,
  });
}
