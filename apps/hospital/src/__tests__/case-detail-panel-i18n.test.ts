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
  formatQuestionnaireFallbackFieldLabel,
  getDiagnosisCostEstimateLabel,
  getDiagnosisTreatmentDurationLabel,
  getMarketingTemplateTypeLabel,
} from '../components/case-detail-panel';

type TranslationFn = (key: string, params?: Record<string, unknown>, fallback?: string) => string;

function createTranslationFn(overrides: Record<string, string>): TranslationFn {
  return (key, _params, fallback) => overrides[key] ?? fallback ?? key;
}

describe('case detail panel i18n helpers', () => {
  it('maps stable diagnosis cost and duration values to localized labels', () => {
    const t = createTranslationFn({
      'hospital.caseDetail.diagnosisDialog.costOptions.5k': 'Localized Under 5K',
      'hospital.caseDetail.diagnosisDialog.durationOptions.2weeks': 'Localized 1-2 weeks',
    });

    expect(getDiagnosisCostEstimateLabel('< $5k', t)).toBe('Localized Under 5K');
    expect(getDiagnosisTreatmentDurationLabel('1 - 2 Weeks', t)).toBe('Localized 1-2 weeks');
    expect(getDiagnosisCostEstimateLabel('Custom quote required', t)).toBe('Custom quote required');
  });

  it('maps known marketing template types through locale-aware labels', () => {
    const t = createTranslationFn({
      'hospital.emailTemplates.types.postOps': 'Localized Post-Ops',
      'hospital.emailTemplates.types.followup': 'Localized Follow-up',
    });

    expect(getMarketingTemplateTypeLabel('post_ops', t)).toBe('Localized Post-Ops');
    expect(getMarketingTemplateTypeLabel('followup', t)).toBe('Localized Follow-up');
    expect(getMarketingTemplateTypeLabel('case_update', t)).toBe('Case Update');
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
});
