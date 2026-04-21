import { describe, expect, it } from 'vitest';
import {
  getHospitalGenderShortLabel,
  getHospitalStatusLabel,
  getLocalizedCountryLabel,
  getLocalizedLanguageLabel,
} from '../lib/hospital-display';

type TranslationFn = (key: string, params?: Record<string, unknown>, fallback?: string) => string;

function createTranslationFn(overrides: Record<string, string>): TranslationFn {
  return (key, _params, fallback) => overrides[key] ?? fallback ?? key;
}

describe('hospital display helpers', () => {
  it('maps unknown status values to a localized unknown label', () => {
    const t = createTranslationFn({
      'hospital.common.statuses.new': 'Localized New',
      'hospital.common.statuses.unknown': 'Localized Unknown',
    });

    expect(getHospitalStatusLabel('NEW', t)).toBe('Localized New');
    expect(getHospitalStatusLabel('BRAND_NEW_BACKEND_STATUS', t)).toBe('Localized Unknown');
  });

  it('maps unknown gender values to a localized unknown label', () => {
    const t = createTranslationFn({
      'hospital.common.genderMaleShort': 'M',
      'hospital.common.genderFemaleShort': 'F',
      'hospital.common.unknown': 'Localized Unknown',
    });

    expect(getHospitalGenderShortLabel('MALE', t)).toBe('M');
    expect(getHospitalGenderShortLabel('NON_BINARY_BACKEND_CODE', t)).toBe('Localized Unknown');
    expect(getHospitalGenderShortLabel(null, t)).toBe('');
  });

  it('maps unsupported country and language codes to a localized unknown label', () => {
    const t = createTranslationFn({
      'hospital.common.unknown': 'Localized Unknown',
    });

    expect(getLocalizedCountryLabel('ZZZ', 'en', t)).toBe('Localized Unknown');
    expect(getLocalizedLanguageLabel('zz-ZZZ', 'en', t)).toBe('Localized Unknown');
    expect(getLocalizedLanguageLabel('US', 'en', t)).toBe('Localized Unknown');
    expect(getLocalizedCountryLabel('Argentina', 'en', t)).toBe('Argentina');
    expect(getLocalizedLanguageLabel('English', 'en', t)).toBe('English');
    expect(getLocalizedCountryLabel('中国', 'zh', t)).toBe('中国');
    expect(getLocalizedLanguageLabel('中文', 'zh', t)).toBe('中文');
  });
});
