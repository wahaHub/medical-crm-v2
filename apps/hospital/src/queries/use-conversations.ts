import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useConversations(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['conversations', params ?? {}],
    queryFn: () => queryFetch(`/api/conversations?${new URLSearchParams(params)}`),
  });
}
