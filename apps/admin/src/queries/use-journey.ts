import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useCaseJourney(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'journey'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/journey`),
    enabled: !!caseId,
  });
}

export function useCaseMilestones(caseId: string) {
  return useQuery({
    queryKey: ['cases', caseId, 'milestones'],
    queryFn: () => queryFetch(`/api/cases/${caseId}/milestones`),
    enabled: !!caseId,
  });
}
