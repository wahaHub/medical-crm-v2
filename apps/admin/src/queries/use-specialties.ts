import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useSpecialties(type: string) {
  return useQuery({
    queryKey: ['specialties', type],
    queryFn: () => queryFetch<{ specialties: string[] }>(`/api/specialties?type=${type}`),
    enabled: !!type,
  });
}
