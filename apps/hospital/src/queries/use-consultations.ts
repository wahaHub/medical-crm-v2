import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useConsultations(params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: ['consultations', params],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      if (pageParam) p.set('cursor', pageParam as string);
      return queryFetch(`/api/consultations?${p}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: any) => lastPage.nextCursor ?? null,
  });
}

export function useConsultationStats() {
  return useQuery({
    queryKey: ['consultations', 'stats'],
    queryFn: () => queryFetch('/api/consultations/stats'),
  });
}
