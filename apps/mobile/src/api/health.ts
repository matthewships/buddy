import { useQuery } from '@tanstack/react-query';

import { api } from './client';

/**
 * The one live query in Phase 0. It exists to prove the whole chain compiles
 * and runs: Hono route definition -> AppType -> hc client -> TanStack Query.
 * If apps/api changes the shape of /health, this stops type-checking.
 */
export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.health.$get();
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return res.json();
    },
  });
}
