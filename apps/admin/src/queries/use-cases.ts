import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';

export function useCases(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['cases', filters],
    queryFn: () =>
      queryFetch<PaginatedResponse<CaseSummary>>(`/api/cases?${new URLSearchParams(filters)}`),
  });
}

export function useCaseStats() {
  return useQuery({
    queryKey: ['cases', 'stats'],
    queryFn: () => queryFetch<CaseStats>('/api/cases/stats'),
  });
}

export function useCase(id: string) {
  return useQuery({
    queryKey: ['cases', id],
    queryFn: () => queryFetch<CaseSummary>(`/api/cases/${id}`),
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

export function useCaseQuestionnaire(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'questionnaire'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/questionnaire`),
    enabled: !!caseId,
  });
}

export function useCaseHospitalContacts(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'hospital-contacts'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/hospital-contacts`),
    enabled: !!caseId,
  });
}

export function useCaseQuotesCompare(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'quotes', 'compare'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/quotes/compare`),
    enabled: !!caseId,
  });
}

export function useCaseTimeline(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'timeline'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/timeline`),
    enabled: !!caseId,
  });
}
