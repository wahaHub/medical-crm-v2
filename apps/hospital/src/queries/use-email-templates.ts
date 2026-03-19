import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';
import type { EmailTemplateItem } from '@/lib/api-types';

export function useEmailTemplates() {
  return useQuery<EmailTemplateItem[]>({
    queryKey: ['email-templates'],
    queryFn: () => queryFetch('/api/email-templates'),
  });
}

export function useEmailTemplate(id: string | null) {
  return useQuery<EmailTemplateItem>({
    queryKey: ['email-templates', id],
    queryFn: () => queryFetch(`/api/email-templates/${id}`),
    enabled: !!id,
  });
}
