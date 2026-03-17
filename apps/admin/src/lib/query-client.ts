// apps/hospital/src/lib/query-client.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
import { ApiError } from './errors';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          window.location.replace('/auth/login');
        }
      },
    }),
  });
}
