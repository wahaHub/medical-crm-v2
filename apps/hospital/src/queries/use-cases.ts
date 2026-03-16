import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useCases(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['cases', filters],
    queryFn: () => queryFetch(`/api/cases?${new URLSearchParams(filters)}`),
  });
}

export function useCaseStats() {
  return useQuery({
    queryKey: ['cases', 'stats'],
    queryFn: () => queryFetch('/api/cases/stats'),
  });
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: () => queryFetch(`/api/cases/${id}`),
    enabled: !!id,
  });
}

export function useCaseDocuments(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'documents'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/documents`),
    enabled: !!caseId,
  });
}

export function useCaseProgress(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'progress'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/progress`),
    enabled: !!caseId,
  });
}

export function useCaseConsultations(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'consultations'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/consultations`),
    enabled: !!caseId,
  });
}
