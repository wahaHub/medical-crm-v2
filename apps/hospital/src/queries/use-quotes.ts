import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { QuoteItem } from '@/lib/api-types';

export function useCaseQuotes(caseId: string) {
  return useQuery<QuoteItem[]>({
    queryKey: ['quotes', caseId],
    queryFn: () => queryFetch(`/api/quotes?caseId=${caseId}`),
    enabled: !!caseId,
  });
}
