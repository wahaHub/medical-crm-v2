import { describe, expect, it } from 'vitest';
import {
  extractSafeMessageErrorDetail,
  formatAttachmentTypeForDisplay,
  formatConversationCategoryForDisplay,
  formatParticipantRoleForDisplay,
  formatUserFacingMessageError,
} from '../components/messages-view';

describe('messages view error formatting', () => {
  it('hides backend-ish errors but preserves safe user-facing detail', () => {
    const translate = (key: string, values?: Record<string, string | number>, fallback?: string) => {
      if (key === 'hospital.common.errors.withDetail' && values) {
        return `${values.summary} Details: ${values.detail}`;
      }
      return fallback ?? key;
    };

    expect(extractSafeMessageErrorDetail(new Error('Connection refused to database'))).toBeUndefined();
    expect(extractSafeMessageErrorDetail(new Error('Password protected PDFs are not supported.'))).toBe(
      'Password protected PDFs are not supported.',
    );

    expect(
      formatUserFacingMessageError(
        new Error('Connection refused to database'),
        translate,
        'hospital.portal.messages.preview.translationFailed',
        'Failed to translate PDF preview',
      ),
    ).toBe('Failed to translate PDF preview');

    expect(
      formatUserFacingMessageError(
        new Error('Password protected PDFs are not supported.'),
        translate,
        'hospital.portal.messages.preview.translationFailed',
        'Failed to translate PDF preview',
      ),
    ).toBe('Failed to translate PDF preview Details: Password protected PDFs are not supported.');
  });

  it('maps known conversation enums to localized labels and hides unknown backend codes', () => {
    const translate = (key: string, _values?: Record<string, string | number>, fallback?: string) => fallback ?? key;

    expect(formatConversationCategoryForDisplay('ADMIN_HOSPITAL', translate)).toBe('Admin');
    expect(formatConversationCategoryForDisplay('HOSPITAL_PATIENT', translate)).toBe('Patient');
    expect(formatConversationCategoryForDisplay('SOME_NEW_BACKEND_CODE', translate)).toBe('Other');

    expect(formatParticipantRoleForDisplay('ADMIN_HOSPITAL', translate)).toBe('Admin');
    expect(formatParticipantRoleForDisplay('PATIENT', translate)).toBe('Patient');
    expect(formatParticipantRoleForDisplay('HOSPITAL', translate)).toBe('Hospital');
    expect(formatParticipantRoleForDisplay('UNKNOWN_ENUM', translate)).toBe('Other');
  });

  it('keeps attachment preview type labels bounded and user-friendly', () => {
    const translate = (key: string, _values?: Record<string, string | number>, fallback?: string) => {
      if (key === 'hospital.messages.chat.pdf') return 'Localized PDF';
      return fallback ?? key;
    };

    expect(formatAttachmentTypeForDisplay({ type: 'application/pdf' }, translate)).toBe('Localized PDF');
    expect(formatAttachmentTypeForDisplay({ type: 'image/png' }, translate)).toBe('Image');
    expect(formatAttachmentTypeForDisplay({ type: 'application/vnd.ms-excel' }, translate)).toBe('File');
    expect(formatAttachmentTypeForDisplay({ type: undefined }, translate)).toBe('File');
  });
});
