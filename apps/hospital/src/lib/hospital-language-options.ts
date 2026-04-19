export interface HospitalLanguageOption {
  value: 'en' | 'zh' | 'fr' | 'de' | 'es' | 'bn';
  flag: string;
  key: string;
  fallback: string;
}

export const HOSPITAL_LANGUAGE_OPTIONS: HospitalLanguageOption[] = [
  { value: 'en', flag: '🇺🇸', key: 'hospital.settings.language.options.en', fallback: 'English' },
  { value: 'zh', flag: '🇨🇳', key: 'hospital.settings.language.options.zh', fallback: 'Chinese' },
  { value: 'fr', flag: '🇫🇷', key: 'hospital.settings.language.options.fr', fallback: 'French' },
  { value: 'de', flag: '🇩🇪', key: 'hospital.settings.language.options.de', fallback: 'German' },
  { value: 'es', flag: '🇪🇸', key: 'hospital.settings.language.options.es', fallback: 'Spanish' },
  { value: 'bn', flag: '🇧🇩', key: 'hospital.settings.language.options.bn', fallback: 'Bengali' },
];
