import { describe, expect, it } from 'vitest';
import { HOSPITAL_LANGUAGE_OPTIONS } from '@/lib/hospital-language-options';

describe('hospital language options', () => {
  it('defines the six supported locales with flag metadata', () => {
    expect(HOSPITAL_LANGUAGE_OPTIONS).toEqual([
      {
        value: 'en',
        flag: '🇺🇸',
        key: 'hospital.settings.language.options.en',
        fallback: 'English',
      },
      {
        value: 'zh',
        flag: '🇨🇳',
        key: 'hospital.settings.language.options.zh',
        fallback: 'Chinese',
      },
      {
        value: 'fr',
        flag: '🇫🇷',
        key: 'hospital.settings.language.options.fr',
        fallback: 'French',
      },
      {
        value: 'de',
        flag: '🇩🇪',
        key: 'hospital.settings.language.options.de',
        fallback: 'German',
      },
      {
        value: 'es',
        flag: '🇪🇸',
        key: 'hospital.settings.language.options.es',
        fallback: 'Spanish',
      },
      {
        value: 'bn',
        flag: '🇧🇩',
        key: 'hospital.settings.language.options.bn',
        fallback: 'Bengali',
      },
    ]);
  });
});
