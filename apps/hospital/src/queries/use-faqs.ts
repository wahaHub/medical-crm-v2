import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { FaqItem, ListResponse } from '@/lib/api-types';

export interface FaqCategoryItem {
  id: string;
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useFaqs(category?: string) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const queryString = params.toString();
  const url = queryString ? `/api/chatbot-faq?${queryString}` : '/api/chatbot-faq';

  return useQuery<ListResponse<FaqItem>>({
    queryKey: ['faqs', category ?? 'all'],
    queryFn: () => queryFetch(url),
  });
}

export function useFaqCategories() {
  return useQuery<FaqCategoryItem[]>({
    queryKey: ['faq-categories'],
    queryFn: () => queryFetch('/api/chatbot-faq/categories'),
  });
}
