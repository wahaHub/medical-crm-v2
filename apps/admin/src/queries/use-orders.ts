import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useOrders(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () =>
      queryFetch(`/api/orders?${new URLSearchParams(filters)}`),
  });
}
