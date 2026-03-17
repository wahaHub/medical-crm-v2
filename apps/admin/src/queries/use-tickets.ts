import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useTickets(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () =>
      queryFetch(`/api/tickets?${new URLSearchParams(filters)}`),
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ['tickets', id],
    queryFn: () => queryFetch(`/api/tickets/${id}`),
    enabled: !!id,
  });
}
