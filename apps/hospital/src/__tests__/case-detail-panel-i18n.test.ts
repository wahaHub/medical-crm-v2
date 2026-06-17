import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  formatMessageSectionTitle,
  formatQuestionnaireFallbackFieldLabel,
  getDiagnosisCostEstimateLabel,
  getDiagnosisSeverityLabel,
  getDiagnosisTreatmentDurationLabel,
  getMarketingTemplateTypeLabel,
  shouldShowHospitalCaseDetailTab,
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

function readLocale(name: string) {
  return JSON.parse(
    readFileSync(
      resolve(__dirname, `../../../../packages/shared/i18n/src/locales/${name}.json`),
      'utf8',
    ),
  ) as Record<string, unknown>;
}

function getNestedValue(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, record);
}

describe('case detail panel i18n helpers', () => {
  it('does not leave raw english copy in the case detail panel ui', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/case-detail-panel.tsx'),
      'utf8',
    );

    expect(source).not.toContain('No messages in this section yet');
    expect(source).not.toContain('No messages yet in this section.');
    expect(source).not.toContain("'Attachment'");
    expect(source).not.toContain('Admin / AI & Patient');
    expect(source).not.toContain('Hospital & Patient');
    expect(source).toContain('hospital.cases.detail.messages.inputPlaceholder');
  });

  it('does not leave raw english copy in the case detail loading state', () => {
    const source = readFileSync(
      resolve(__dirname, '../app/(portal)/cases/[id]/loading.tsx'),
      'utf8',
    );

    expect(source).not.toContain('Loading case details');
  });

  it('defines case detail tab, diagnosis type, and message copy keys for every hospital locale', () => {
    const requiredKeys = [
      'hospital.cases.detail.tabs.aiSummary',
      'hospital.cases.detail.tabs.intake',
      'hospital.cases.detail.tabs.documents',
      'hospital.cases.detail.tabs.messages',
      'hospital.cases.detail.tabs.diagnosis',
      'hospital.cases.detail.tabs.quote',
      'hospital.cases.detail.tabs.marketing',
      'hospital.cases.detail.tabs.invitation',
      'hospital.cases.detail.tabs.consultation',
      'hospital.cases.detail.diagnosis.type.preliminary',
      'hospital.cases.detail.diagnosis.type.confirmed',
      'hospital.cases.detail.diagnosis.type.followUp',
      'hospital.cases.detail.messages.sections.adminPatient',
      'hospital.cases.detail.messages.sections.hospitalPatient',
      'hospital.cases.detail.messages.composerHint',
      'hospital.cases.detail.messages.readOnlyHint',
      'hospital.cases.detail.messages.readOnlyTitle',
      'hospital.cases.detail.messages.switchBackToHospital',
      'hospital.cases.detail.messages.hospitalThreadEmpty',
      'hospital.cases.detail.messages.errorSend',
      'hospital.cases.detail.messages.inputPlaceholder',
      'hospital.cases.detail.messages.empty',
      'hospital.cases.detail.messages.privacyNotice',
      'hospital.loading.caseDetail',
    ];

    for (const locale of ['en', 'zh', 'de', 'fr', 'es', 'bn']) {
      const messages = readLocale(locale);

      for (const key of requiredKeys) {
        expect(getNestedValue(messages, key), `${locale} missing ${key}`).toBeTypeOf('string');
      }
    }
  });

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

  it('maps message section ids to localized labels', () => {
    const t = createTranslationFn({
      'hospital.cases.detail.messages.sections.adminPatient': 'Localized Admin / Patient',
      'hospital.cases.detail.messages.sections.hospitalPatient': 'Localized Hospital / Patient',
    });

    expect(formatMessageSectionTitle('admin-patient', t)).toBe('Localized Admin / Patient');
    expect(formatMessageSectionTitle('hospital-patient', t)).toBe('Localized Hospital / Patient');
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

  it('shows only the intake tab matching the case hospital type', () => {
    expect(shouldShowHospitalCaseDetailTab('intake', 'REGULAR')).toBe(true);
    expect(shouldShowHospitalCaseDetailTab('beauty', 'REGULAR')).toBe(false);

    expect(shouldShowHospitalCaseDetailTab('intake', 'COSMETIC')).toBe(false);
    expect(shouldShowHospitalCaseDetailTab('beauty', 'COSMETIC')).toBe(true);
  });

  it('keeps missing hospital type cases on the legacy medical intake path', () => {
    expect(shouldShowHospitalCaseDetailTab('intake', null)).toBe(true);
    expect(shouldShowHospitalCaseDetailTab('beauty', null)).toBe(false);
    expect(shouldShowHospitalCaseDetailTab('documents', null)).toBe(true);
  });
});
