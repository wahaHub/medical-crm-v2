import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { DashboardData } from '@/lib/api-types';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => queryFetch<DashboardData>('/api/dashboard'),
  });
}
