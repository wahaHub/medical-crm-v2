import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { FaqItem } from '@/lib/api-types';

export function useFaqs() {
  return useQuery<FaqItem[]>({
    queryKey: ['faqs'],
    queryFn: () => queryFetch('/api/chatbot-faq'),
  });
}
