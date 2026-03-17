import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useConversations(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: () =>
      queryFetch(`/api/conversations?${new URLSearchParams(filters)}`),
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ['conversations', conversationId, 'messages'],
    queryFn: () =>
      queryFetch(`/api/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
  });
}
