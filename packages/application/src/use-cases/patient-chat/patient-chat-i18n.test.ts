import { describe, expect, it } from 'vitest';
import {
  PATIENT_CHAT_LOCALES,
  normalizePatientChatLocale,
  patientChatCopy,
} from './patient-chat-i18n.js';

describe('patient chat i18n', () => {
  it('provides localized system copy for every supported patient locale', () => {
    const messages = PATIENT_CHAT_LOCALES.map((locale) =>
      patientChatCopy(locale, 'starter.intakeReceived'),
    );

    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(PATIENT_CHAT_LOCALES.length);
  });

  it('normalizes regional locale codes and falls back to English', () => {
    expect(normalizePatientChatLocale('es-MX')).toBe('es');
    expect(normalizePatientChatLocale('ar_SA')).toBe('ar');
    expect(normalizePatientChatLocale('unknown')).toBe('en');
    expect(normalizePatientChatLocale(null)).toBe('en');
  });
});
