import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function usePackages(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['packages', filters],
    queryFn: () =>
      queryFetch(`/api/packages?${new URLSearchParams(filters)}`),
  });
}

export function usePackage(id: string | null) {
  return useQuery({
    queryKey: ['packages', id],
    queryFn: () => queryFetch(`/api/packages/${id}`),
    enabled: !!id,
  });
}
