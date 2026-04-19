import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@medical-crm/ui', () => ({
  StatusBadge: () => null,
  MessageCaseDetailPanel: () => null,
  QuestionnaireReadonlyView: () => null,
  LoadingSpinner: () => null,
}));

vi.mock('../components/tabs/case-ai-summary-tab', () => ({
  CaseAiSummaryTab: () => null,
}));

vi.mock('../components/tabs/case-quote-tab', () => ({
  CaseQuoteTab: () => null,
}));

vi.mock('@/queries/use-cases', () => ({
  useCaseConsultations: () => ({ data: [] }),
  useCaseConversations: () => ({ data: { data: [] }, isLoading: false }),
  useConversationMessages: () => ({ data: { data: [] }, isLoading: false }),
  useCaseQuestionnaire: () => ({ data: null, isLoading: false, error: null }),
  useQuestionTemplate: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/queries/use-consultations', () => ({
  useConsultationTranscript: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/queries/use-email-templates', () => ({
  useEmailTemplates: () => ({ data: [] }),
}));

vi.mock('@/actions/case-actions', () => ({
  addDiagnosis: vi.fn(),
}));

vi.mock('@/components/create-consultation-modal', () => ({
  CreateConsultationModal: () => null,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/hospital-display', () => ({
  formatDurationMinutesLabel: () => '',
  getHospitalGenderShortLabel: () => '',
  getHospitalStatusLabel: () => '',
  getLocalizedCountryLabel: () => '',
  getLocalizedLanguageLabel: () => '',
}));

vi.mock('@/lib/hospital-i18n', () => ({
  useHospitalI18n: () => ({
    locale: 'en',
    t: (_key: string, _params?: Record<string, unknown>, fallback?: string) => fallback ?? _key,
  }),
}));

import {
  extractSafeCaseDetailErrorDetail,
  formatDocumentGroupLabel,
  formatCaseConversationCategoryForDisplay,
  formatCaseDetailUserFacingError,
  formatQuestionnaireFallbackFieldLabel,
  getDiagnosisCostEstimateLabel,
  getDiagnosisSeverityLabel,
  getDiagnosisTreatmentDurationLabel,
  getMarketingTemplateTypeLabel,
} from '../components/case-detail-panel';

type TranslationFn = (key: string, params?: Record<string, unknown>, fallback?: string) => string;

function createTranslationFn(overrides: Record<string, string>): TranslationFn {
  return (key, params, fallback) => {
    if (key === 'hospital.common.errors.withDetail' && params) {
      return `${params.summary} Details: ${params.detail}`;
    }

    return overrides[key] ?? fallback ?? key;
  };
}

describe('case detail panel i18n helpers', () => {
  it('maps stable diagnosis cost and duration values to localized labels', () => {
    const t = createTranslationFn({
      'hospital.caseDetail.diagnosisDialog.costOptions.5k': 'Localized Under 5K',
      'hospital.caseDetail.diagnosisDialog.durationOptions.2weeks': 'Localized 1-2 weeks',
      'common.labels.other': 'Localized Other',
    });

    expect(getDiagnosisCostEstimateLabel('< $5k', t)).toBe('Localized Under 5K');
    expect(getDiagnosisTreatmentDurationLabel('1 - 2 Weeks', t)).toBe('Localized 1-2 weeks');
    expect(getDiagnosisCostEstimateLabel('Custom quote required', t)).toBe('Localized Other');
  });

  it('maps known marketing template types through locale-aware labels', () => {
    const t = createTranslationFn({
      'hospital.emailTemplates.types.postOps': 'Localized Post-Ops',
      'hospital.emailTemplates.types.followup': 'Localized Follow-up',
      'common.labels.other': 'Localized Other',
    });

    expect(getMarketingTemplateTypeLabel('post_ops', t)).toBe('Localized Post-Ops');
    expect(getMarketingTemplateTypeLabel('followup', t)).toBe('Localized Follow-up');
    expect(getMarketingTemplateTypeLabel('case_update', t)).toBe('Localized Other');
  });

  it('normalizes fallback questionnaire keys before looking up a localized label', () => {
    const t = createTranslationFn({
      'hospital.cases.detail.intake.fields.primary_location': 'Localized Primary Location',
      'hospital.cases.detail.intake.fields.risk_level': 'Localized Risk Level',
    });

    expect(formatQuestionnaireFallbackFieldLabel('primary_location', t)).toBe('Localized Primary Location');
    expect(formatQuestionnaireFallbackFieldLabel('riskLevel', t)).toBe('Localized Risk Level');
    expect(formatQuestionnaireFallbackFieldLabel('chiefComplaint', t)).toBe('Chief Complaint');
  });

  it('hides backend-ish case detail errors but preserves safe validation detail', () => {
    const t = createTranslationFn({
      'hospital.common.errors.withDetail': '{summary} Details: {detail}',
    });

    expect(extractSafeCaseDetailErrorDetail(new Error('API error 500'))).toBeUndefined();
    expect(extractSafeCaseDetailErrorDetail(new Error('Diagnosis name is required.'))).toBe(
      'Diagnosis name is required.',
    );

    expect(
      formatCaseDetailUserFacingError(
        new Error('API error 500'),
        t,
        'hospital.cases.detail.diagnosis.errorSave',
        'Failed to save diagnosis',
      ),
    ).toBe('Failed to save diagnosis');

    expect(
      formatCaseDetailUserFacingError(
        new Error('Diagnosis name is required.'),
        t,
        'hospital.cases.detail.diagnosis.errorSave',
        'Failed to save diagnosis',
      ),
    ).toBe('Failed to save diagnosis Details: Diagnosis name is required.');
  });

  it('maps case conversation categories to localized labels and hides unknown codes', () => {
    const t = createTranslationFn({
      'hospital.common.patient': 'Localized Patient',
      'hospital.messages.chat.admin': 'Localized Admin',
      'common.labels.other': 'Localized Other',
    });

    expect(formatCaseConversationCategoryForDisplay('HOSPITAL_PATIENT', t)).toBe('Localized Patient');
    expect(formatCaseConversationCategoryForDisplay('ADMIN_HOSPITAL', t)).toBe('Localized Admin');
    expect(formatCaseConversationCategoryForDisplay('NEW_BACKEND_CATEGORY', t)).toBe('Localized Other');
  });

  it('maps unknown document groups to a localized other-documents label', () => {
    const t = createTranslationFn({
      'hospital.cases.detail.documents.groups.diagnosis': 'Localized Diagnosis',
      'hospital.cases.detail.documents.groups.otherDocuments': 'Localized Other Documents',
    });

    expect(formatDocumentGroupLabel('DIAGNOSIS', t)).toBe('Localized Diagnosis');
    expect(formatDocumentGroupLabel('SURPRISE_BACKEND_DOC_TYPE', t)).toBe('Localized Other Documents');
  });

  it('maps diagnosis severity values through locale-aware labels and hides unknown codes', () => {
    const t = createTranslationFn({
      'hospital.cases.detail.diagnosis.severity.mild': 'Localized Mild',
      'hospital.cases.detail.diagnosis.severity.moderate': 'Localized Moderate',
      'hospital.cases.detail.diagnosis.severity.severe': 'Localized Severe',
      'hospital.common.unknown': 'Localized Unknown',
    });

    expect(getDiagnosisSeverityLabel('mild', t)).toBe('Localized Mild');
    expect(getDiagnosisSeverityLabel('moderate', t)).toBe('Localized Moderate');
    expect(getDiagnosisSeverityLabel('severe', t)).toBe('Localized Severe');
    expect(getDiagnosisSeverityLabel('CRITICAL_BACKEND_CODE', t)).toBe('Localized Unknown');
  });
});
