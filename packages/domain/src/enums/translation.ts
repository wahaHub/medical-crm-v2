// Translation Task Status
export type TranslationTaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Source database for translation tasks
export type SourceDb = 'crm' | 'supabase_beauty' | 'supabase_china';

// Supported languages for translation
export type SupportedLanguage = 'zh' | 'en' | 'ru' | 'fr' | 'es' | 'de' | 'ar' | 'id' | 'vi';
