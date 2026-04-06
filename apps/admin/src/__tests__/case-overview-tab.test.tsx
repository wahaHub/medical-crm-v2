import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectedHospitalsCard } from '../components/tabs/case-overview-tab';

const {
  mockUseQueryClient,
  mockUseCaseHospitalContacts,
  mockUseHospitalNameMap,
} = vi.hoisted(() => ({
  mockUseQueryClient: vi.fn(),
  mockUseCaseHospitalContacts: vi.fn(),
  mockUseHospitalNameMap: vi.fn(),
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
  useCaseDocuments: vi.fn(),
  useCaseHospitalContacts: mockUseCaseHospitalContacts,
  useCaseProgress: vi.fn(),
}));

vi.mock('@/queries/use-hospital-names', () => ({
  useHospitalNameMap: mockUseHospitalNameMap,
}));

vi.mock('@/actions/case-actions', () => ({
  addCaseNote: vi.fn(),
  initCaseDocumentUpload: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('@/actions/quote-actions', () => ({
  requestQuotesForHospitalContacts: vi.fn(),
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
