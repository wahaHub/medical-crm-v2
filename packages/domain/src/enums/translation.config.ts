import type { SupportedLanguage } from './translation.js';

export const TRANSLATION_CONFIG = {
  supportedLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as SupportedLanguage[],
  defaultTargetLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as SupportedLanguage[],
  translatableFields: {
    support_ticket: ['subject', 'description', 'resolutionNote'],
    support_ticket_reply: ['content'],
    consultation: ['notes'],
    qc_template: ['templateName', 'questions'],
    qc_response: ['responses'],
    chatbot_faq_item: ['category', 'question', 'answer', 'keywords'],
    chatbot_faq_category: ['name'],
    hospital_info: [
      'name',
      'tagline',
      'description',
      'overview',
      'full_description',
      'hospital_type',
      'tier',
      'ownership_type',
      'core_specialties',
      'departments_info',
    ],
    surgeon: ['title', 'intro', 'expertise', 'philosophy', 'achievements', 'specialties', 'education', 'certifications'],
    procedure_case: ['description', 'provider_name'],
  } as Record<string, string[]>,
  retry: {
    maxRetries: 3,
  },
} as const;
