import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { ListResponse, QuoteItem } from '@/lib/api-types';

export function useCaseQuotes(caseId: string) {
  return useQuery<ListResponse<QuoteItem>>({
    queryKey: ['quotes', caseId],
    queryFn: () => queryFetch(`/api/quotes?caseId=${encodeURIComponent(caseId)}`),
    enabled: !!caseId,
  });
}
