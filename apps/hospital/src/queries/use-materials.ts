import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { MaterialsPackageDTO, MaterialsReviewDTO } from '@/lib/api-types';

export function useMaterialsInfo() {
  return useQuery({
    queryKey: ['materials', 'info'],
    queryFn: () => queryFetch('/api/materials'),
  });
}

export function useProcedures() {
  return useQuery({
    queryKey: ['materials', 'procedures'],
    queryFn: () => queryFetch('/api/materials/procedures'),
  });
}

export function useSurgeons() {
  return useQuery({
    queryKey: ['materials', 'surgeons'],
    queryFn: () => queryFetch('/api/materials/surgeons'),
  });
}

export function useBeforeAfterCases() {
  return useQuery({
    queryKey: ['materials', 'cases'],
    queryFn: () => queryFetch('/api/materials/cases'),
  });
}

export function useReviews() {
  return useQuery<MaterialsReviewDTO[]>({
    queryKey: ['materials', 'reviews'],
    queryFn: () => queryFetch('/api/materials/reviews'),
  });
}

export function usePackages() {
  return useQuery<MaterialsPackageDTO[]>({
    queryKey: ['materials', 'packages'],
    queryFn: () => queryFetch('/api/materials/packages'),
  });
}

export function usePackage(id: string | null) {
  return useQuery<MaterialsPackageDTO>({
    queryKey: ['materials', 'packages', id],
    queryFn: () => queryFetch(`/api/materials/packages/${id}`),
    enabled: !!id,
  });
}
