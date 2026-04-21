import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaseOverviewTab, SelectedHospitalsCard } from '../components/tabs/case-overview-tab';

const {
  mockUseQueryClient,
  mockUseCaseHospitalContacts,
  mockUseHospitalNameMap,
  mockUseCaseDocuments,
  mockUseCaseProgress,
  mockUseHospitals,
} = vi.hoisted(() => ({
  mockUseQueryClient: vi.fn(),
  mockUseCaseHospitalContacts: vi.fn(),
  mockUseHospitalNameMap: vi.fn(),
  mockUseCaseDocuments: vi.fn(),
  mockUseCaseProgress: vi.fn(),
  mockUseHospitals: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mockUseQueryClient,
}));

vi.mock('@medical-crm/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-slot="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-slot="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  Button: ({
    children,
    className,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button className={className} {...props}>{children}</button>
  ),
  DataTable: () => <div />,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  useMediaUpload: () => ({
    upload: vi.fn(),
    isUploading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('@/queries/use-cases', () => ({
  useCaseDocuments: mockUseCaseDocuments,
  useCaseHospitalContacts: mockUseCaseHospitalContacts,
  useCaseProgress: mockUseCaseProgress,
}));

vi.mock('@/queries/use-hospital-names', () => ({
  useHospitalNameMap: mockUseHospitalNameMap,
}));

vi.mock('@/queries/use-hospitals', () => ({
  useHospitals: mockUseHospitals,
}));

vi.mock('@/actions/case-actions', () => ({
  addCaseNote: vi.fn(),
  initCaseDocumentUpload: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('@/actions/quote-actions', () => ({
  addHospitalToCase: vi.fn(),
  removeHospitalContact: vi.fn(),
  requestQuotesForHospitalContacts: vi.fn(),
  resetCaseAssignment: vi.fn(),
}));

describe('SelectedHospitalsCard layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.React = React;
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
    mockUseHospitalNameMap.mockReturnValue({
      nameMap: {
        'hospital-1': 'Shanghai One',
      },
    });
    mockUseCaseDocuments.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockUseCaseProgress.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    });
    mockUseCaseHospitalContacts.mockReturnValue({
      data: [
        {
          id: 'contact-1',
          hospitalId: 'hospital-1',
          hospitalName: 'Shanghai One',
          subStatus: 'DISTRIBUTED',
          selectedByPatientAt: '2026-04-03T10:00:00.000Z',
          distributedAt: '2026-04-03T09:00:00.000Z',
          quoteId: null,
          patientAcceptedAt: null,
          patientRejectedAt: null,
          reminderSentAt: null,
          removedAt: null,
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseHospitals.mockReturnValue({
      data: {
        data: [
          {
            id: 'hospital-cosmetic',
            name: 'Cosmetic Alpha',
            type: 'COSMETIC',
            status: 'ACTIVE',
            specialties: [],
            email: null,
            phone: null,
            address: null,
            city: null,
            createdAt: '2026-04-03T00:00:00.000Z',
          },
          {
            id: 'hospital-cosmetic-2',
            name: 'Cosmetic Gamma',
            type: 'COSMETIC',
            status: 'ACTIVE',
            specialties: [],
            email: null,
            phone: null,
            address: null,
            city: null,
            createdAt: '2026-04-03T00:00:00.000Z',
          },
          {
            id: 'hospital-regular',
            name: 'Regular Beta',
            type: 'REGULAR',
            status: 'ACTIVE',
            specialties: [],
            email: null,
            phone: null,
            address: null,
            city: null,
            createdAt: '2026-04-03T00:00:00.000Z',
          },
        ],
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
      },
      isPending: false,
    });
  });

  it('renders the bulk quote action inside a full-width header row with the button pushed right', () => {
    const markup = renderToStaticMarkup(
      <SelectedHospitalsCard
        caseData={{
          id: 'case-1',
        } as never}
      />,
    );

    expect(markup).toContain('Hospitals Selected By Patient');
    expect(markup).toContain('Send Quote Request');
    expect(markup).toContain('class="flex w-full items-start justify-between gap-4"');
    expect(markup).toContain('sm:ml-auto');
  });

  it('renders a custom hospital request without a quote action button', () => {
    const markup = renderToStaticMarkup(
      <SelectedHospitalsCard
        caseData={{
          id: 'case-1',
          customHospitalRequest: 'Ruijin Hospital',
        } as never}
      />,
    );

    expect(markup).toContain('Custom hospital requested');
    expect(markup).toContain('Ruijin Hospital');
  });
});

describe('CaseOverviewTab hospital assignment context', () => {
  it('renders patient site, derived hospital type, and only same-type hospitals in the assignment checklist', () => {
    const markup = renderToStaticMarkup(
      <CaseOverviewTab
        caseData={{
          id: 'case-1',
          caseNumber: 'CASE-2026-1001',
          patientName: 'Jane Doe',
          status: 'ACTIVE',
          assignmentStatus: 'UNASSIGNED',
          treatmentStage: null,
          patientSite: 'beauty',
          hospitalType: 'COSMETIC',
          createdAt: '2026-04-03T00:00:00.000Z',
        } as never}
      />,
    );

    expect(markup).toContain('Patient Site');
    expect(markup).toContain('beauty');
    expect(markup).toContain('Hospital Type');
    expect(markup).toContain('COSMETIC');
    expect(markup).toContain('Cosmetic Alpha');
    expect(markup).toContain('Cosmetic Gamma');
    expect(markup).not.toContain('Regular Beta');
    expect(markup).toContain('Save Changes');
    expect(markup).toContain('type="checkbox"');
  });

  it('keeps existing hospital cleanup available when the case hospital type cannot be determined', () => {
    const markup = renderToStaticMarkup(
      <CaseOverviewTab
        caseData={{
          id: 'case-1',
          caseNumber: 'CASE-2026-1001',
          patientName: 'Jane Doe',
          status: 'ACTIVE',
          assignmentStatus: 'UNASSIGNED',
          treatmentStage: null,
          patientSite: null,
          hospitalType: null,
          createdAt: '2026-04-03T00:00:00.000Z',
        } as never}
      />,
    );

    expect(markup).toContain('only cleanup unassignments are available');
    expect(markup).toContain('Shanghai One');
    expect(markup).toContain('Distributed');
    expect(markup).not.toContain('Regular Beta');
  });

  it('keeps the already assigned hospital in the checklist so it can be unchecked later', () => {
    const markup = renderToStaticMarkup(
      <CaseOverviewTab
        caseData={{
          id: 'case-1',
          caseNumber: 'CASE-2026-1001',
          patientName: 'Jane Doe',
          status: 'ACTIVE',
          assignmentStatus: 'ASSIGNED',
          assignedHospitalId: 'hospital-cosmetic',
          hospitalName: 'Cosmetic Alpha',
          treatmentStage: null,
          patientSite: 'beauty',
          hospitalType: 'COSMETIC',
          createdAt: '2026-04-03T00:00:00.000Z',
        } as never}
      />,
    );

    expect(markup).toContain('Cosmetic Alpha');
    expect(markup).toContain('Cosmetic Gamma');
    expect(markup).toContain('Assigned');
  });

  it('renders a checkbox list with Save Changes for assigned hospital management', () => {
    const markup = renderToStaticMarkup(
      <CaseOverviewTab
        caseData={{
          id: 'case-1',
          caseNumber: 'CASE-2026-1001',
          patientName: 'Jane Doe',
          status: 'ACTIVE',
          assignmentStatus: 'ASSIGNED',
          assignedHospitalId: 'hospital-cosmetic',
          hospitalName: 'Cosmetic Alpha',
          treatmentStage: null,
          patientSite: 'beauty',
          hospitalType: 'COSMETIC',
          createdAt: '2026-04-03T00:00:00.000Z',
        } as never}
      />,
    );

    expect(markup).toContain('Save Changes');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('Cosmetic Alpha');
    expect(markup).toContain('Cosmetic Gamma');
    expect(markup).not.toContain('<select');
  });

  it('renders assignment filter tabs and a scrollable checklist container', () => {
    const markup = renderToStaticMarkup(
      <CaseOverviewTab
        caseData={{
          id: 'case-1',
          caseNumber: 'CASE-2026-1001',
          patientName: 'Jane Doe',
          status: 'ACTIVE',
          assignmentStatus: 'ASSIGNED',
          assignedHospitalId: 'hospital-cosmetic',
          hospitalName: 'Cosmetic Alpha',
          treatmentStage: null,
          patientSite: 'beauty',
          hospitalType: 'COSMETIC',
          createdAt: '2026-04-03T00:00:00.000Z',
        } as never}
      />,
    );

    expect(markup).toContain('All');
    expect(markup).toContain('Distributed');
    expect(markup).toContain('Available');
    expect(markup).toContain('max-h-80');
    expect(markup).toContain('overflow-y-auto');
  });
});
