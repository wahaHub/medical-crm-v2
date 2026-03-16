import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useMessages(conversationId: string, page = 1) {
  return useQuery({
    queryKey: ['conversations', conversationId, 'messages', { page }],
    queryFn: () => queryFetch(`/api/conversations/${conversationId}/messages?page=${page}&limit=50`),
    enabled: !!conversationId,
  });
}
