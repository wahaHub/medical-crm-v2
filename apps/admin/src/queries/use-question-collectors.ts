import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useQuestionTemplates(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['question-templates', filters],
    queryFn: () =>
      queryFetch(`/api/question-templates?${new URLSearchParams(filters)}`),
  });
}

export function useQuestionTemplate(id: string | null) {
  return useQuery({
    queryKey: ['question-templates', id],
    queryFn: () => queryFetch(`/api/question-templates/${id}`),
    enabled: !!id,
  });
}

export function useQuestionnaireResponses(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['questionnaire-responses', filters],
    queryFn: () =>
      queryFetch(`/api/questionnaire-responses?${new URLSearchParams(filters)}`),
  });
}

export function useTemplateCustomizations(templateId: string | null) {
  return useQuery({
    queryKey: ['question-templates', templateId, 'customizations'],
    queryFn: () =>
      queryFetch(`/api/question-templates/${templateId}/customizations`),
    enabled: !!templateId,
  });
}
