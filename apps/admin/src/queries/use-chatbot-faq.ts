import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useChatbotFaqs(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['chatbot-faqs', filters],
    queryFn: () =>
      queryFetch(`/api/chatbot/faqs?${new URLSearchParams(filters)}`),
  });
}

export function useChatbotFaq(id: string | null) {
  return useQuery({
    queryKey: ['chatbot-faqs', id],
    queryFn: () => queryFetch(`/api/chatbot/faqs/${id}`),
    enabled: !!id,
  });
}

export function useChatbotAnalytics() {
  return useQuery({
    queryKey: ['chatbot-analytics'],
    queryFn: () => queryFetch('/api/chatbot/analytics'),
  });
}

export function useFaqCategories(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['faq-categories', filters],
    queryFn: () =>
      queryFetch(`/api/chatbot/faqs/categories?${new URLSearchParams(filters)}`),
  });
}
