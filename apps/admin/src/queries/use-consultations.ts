import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useCaseConsultations(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'consultations'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/consultations`),
    enabled: !!caseId,
  });
}

export function useConsultationTranscript(consultationId: string | null) {
  return useQuery({
    queryKey: ['consultations', consultationId, 'transcript'],
    queryFn: () => queryFetch(`/api/consultations/${consultationId}/transcript`),
    enabled: !!consultationId,
  });
}
