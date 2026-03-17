import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { PaginatedResponse, HospitalSummary, CaseSummary } from '@/lib/api-types';

export function useHospitals(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['hospitals', filters],
    queryFn: () =>
      queryFetch<PaginatedResponse<HospitalSummary>>(`/api/hospitals?${new URLSearchParams(filters)}`),
  });
}

export function useHospital(id: string) {
  return useQuery({
    queryKey: ['hospitals', id],
    queryFn: () => queryFetch<HospitalSummary>(`/api/hospitals/${id}`),
    enabled: !!id,
  });
}

export function useHospitalCases(hospitalId: string, filters: Record<string, string>) {
  return useQuery({
    queryKey: ['hospitals', hospitalId, 'cases', filters],
    queryFn: () =>
      queryFetch<PaginatedResponse<CaseSummary>>(
        `/api/hospitals/${hospitalId}/cases?${new URLSearchParams(filters)}`,
      ),
    enabled: !!hospitalId,
  });
}
