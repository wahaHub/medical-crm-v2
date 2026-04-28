import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error @medical-crm/hospital does not currently install @types/react-dom.
const { renderToStaticMarkup } = await import('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@medical-crm/ui', () => ({
  StatusBadge: ({ label }: { label?: string }) => <span>{label}</span>,
  MessageCaseDetailPanel: () => null,
  QuestionnaireReadonlyView: () => null,
  LoadingSpinner: () => null,
}));

vi.mock('@/queries/use-cases', () => ({
  useCaseConsultations: () => ({ data: [] }),
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

vi.mock('@/components/tabs/case-ai-summary-tab', () => ({
  CaseAiSummaryTab: () => null,
}));

vi.mock('@/components/tabs/case-quote-tab', () => ({
  CaseQuoteTab: () => null,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'hospital-user-1' } }),
}));

vi.mock('@/lib/hospital-display', () => ({
  formatDurationMinutesLabel: () => '',
  getHospitalGenderShortLabel: () => '',
  getHospitalStatusLabel: (_status: string, _t: unknown) => 'In Progress',
  getLocalizedCountryLabel: (country: string) => country,
  getLocalizedLanguageLabel: (language: string) => language,
}));

vi.mock('@/lib/hospital-i18n', () => ({
  useHospitalI18n: () => ({
    locale: 'en',
    t: (_key: string, params?: Record<string, unknown>, fallback?: string) => {
      if (fallback?.includes('{count}') && typeof params?.count !== 'undefined') {
        return fallback.replace('{count}', String(params.count));
      }
      return fallback ?? '';
    },
  }),
}));

import { CaseDetailPanel } from '../components/case-detail-panel';

describe('CaseDetailPanel created-at display', () => {
  it('renders the case creation time in the hospital case detail header', () => {
    globalThis.React = React;

    const markup = renderToStaticMarkup(
      <CaseDetailPanel
        caseDetail={{
          id: 'case-1',
          caseNumber: 'CASE-2026-1001',
          displayStatus: 'in_treatment',
          patient: {
            id: 'patient-1',
            name: 'Jane Doe',
            code: 'P-1001',
            country: 'China',
            language: 'en',
            age: 35,
            gender: 'female',
          },
          medicalCondition: {
            primaryDiagnosis: 'Cardiology consult',
            diagnosisCode: null,
            symptoms: null,
            medicalHistory: null,
          },
          aiSummary: null,
          riskLevel: null,
          diagnoses: [],
          phoneCalls: [],
          consultationHistory: [],
          documents: [],
          messageSections: [],
          totalMessages: 0,
          createdAt: '2026-04-03T08:45:30',
          updatedAt: '2026-04-03T08:45:30',
        }}
      />,
    );

    expect(markup).toContain('Created');
    expect(markup).toContain('8:45');
  });
});
