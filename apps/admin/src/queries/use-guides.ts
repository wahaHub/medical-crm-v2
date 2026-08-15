import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useGuides(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['guides', filters],
    queryFn: () => queryFetch(`/api/guides?${new URLSearchParams(filters)}`),
  });
}

export function useGuide(id: string | null) {
  return useQuery({
    queryKey: ['guides', id],
    queryFn: () => queryFetch(`/api/guides/${id}`),
    enabled: Boolean(id),
  });
}
