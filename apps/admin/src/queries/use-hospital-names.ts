import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { HospitalSummary } from '@/lib/api-types';

interface UseHospitalNameMapResult {
  nameMap: Record<string, string>;
  isLoading: boolean;
}

export function useHospitalNameMap(
  hospitalIds: Array<string | null | undefined>,
): UseHospitalNameMapResult {
  const ids = useMemo(
    () => Array.from(new Set(hospitalIds.filter((id): id is string => Boolean(id)))),
    [hospitalIds],
  );

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['hospitals', id, 'name'],
      queryFn: () => queryFetch<HospitalSummary>(`/api/hospitals/${id}`),
      enabled: !!id,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const nameMap: Record<string, string> = {};
  ids.forEach((id, idx) => {
    const data = results[idx]?.data as HospitalSummary | undefined;
    if (data?.name) {
      nameMap[id] = data.name;
    }
  });

  return {
    nameMap,
    isLoading: results.some((query) => query.isLoading),
  };
}
