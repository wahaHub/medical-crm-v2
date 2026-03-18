import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => queryFetch('/api/users/me'),
  });
}
