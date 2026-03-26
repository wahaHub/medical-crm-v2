import type { SupportedLanguage } from './translation.js';

export const TRANSLATION_CONFIG = {
  supportedLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as SupportedLanguage[],
  defaultTargetLanguages: ['zh', 'en', 'ru', 'fr', 'es', 'de', 'ar', 'id', 'vi'] as SupportedLanguage[],
  translatableFields: {
    hospital: ['name', 'description', 'address', 'specialties'],
    procedure: ['name', 'description', 'benefits', 'risks'],
    surgeon: ['name', 'bio', 'specialization'],
    case: ['notes', 'description', 'treatmentPlan'],
    message: ['content'],
    consultation: ['summary', 'notes'],
    material: ['title', 'description', 'content'],
  } as Record<string, string[]>,
  retry: {
    maxRetries: 3,
  },
} as const;
