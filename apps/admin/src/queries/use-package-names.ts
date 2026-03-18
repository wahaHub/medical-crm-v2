import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

interface PackageSummaryLike {
  id: string;
  nameEn?: string | null;
  nameZh?: string | null;
}

interface UsePackageNameMapResult {
  nameMap: Record<string, string>;
  isLoading: boolean;
}

export function usePackageNameMap(
  packageIds: Array<string | null | undefined>,
): UsePackageNameMapResult {
  const ids = useMemo(
    () => Array.from(new Set(packageIds.filter((id): id is string => Boolean(id)))),
    [packageIds],
  );

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['packages', id, 'name'],
      queryFn: () => queryFetch<PackageSummaryLike>(`/api/packages/${id}`),
      enabled: !!id,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const nameMap: Record<string, string> = {};
  ids.forEach((id, idx) => {
    const data = results[idx]?.data;
    const name = data?.nameEn ?? data?.nameZh ?? undefined;
    if (name) {
      nameMap[id] = name;
    }
  });

  return {
    nameMap,
    isLoading: results.some((query) => query.isLoading),
  };
}
