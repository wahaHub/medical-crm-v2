'use client';

import { Card, CardHeader, CardTitle, StatusBadge, DataTable, EmptyState, Button, type Column } from '@medical-crm/ui';
import { Building2, Clock } from 'lucide-react';
import { useCaseHospitalContacts, useCaseQuotesCompare } from '@/queries/use-cases';
import { QuoteComparison } from '@/components/quote-comparison';

interface HospitalContact {
  id: string;
  hospitalId: string;
  hospitalName: string;
  status: string;
  invitedAt: string;
  respondedAt?: string;
}

interface CaseQuotesTabProps {
  caseId: string;
}

function InvitedHospitalsCard({ caseId }: { caseId: string }) {
  const { data: raw, isLoading } = useCaseHospitalContacts(caseId);
  const contacts: HospitalContact[] = (raw as HospitalContact[] | undefined) ?? [];

  const columns: Column<HospitalContact>[] = [
    {
      key: 'hospital',
      header: 'Hospital',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-indigo-400 shrink-0" />
          <span className="text-sm font-medium text-slate-800">{row.hospitalName}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'invitedAt',
      header: 'Invited',
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock size={12} />
          {new Date(row.invitedAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'respondedAt',
      header: 'Responded',
      render: (row) => (
        <span className="text-xs text-slate-400">
          {row.respondedAt ? new Date(row.respondedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invited Hospitals</CardTitle>
        {/* Add Hospital button — placeholder, no backend action yet */}
        <Button variant="outline" size="sm" disabled>
          + Add Hospital
        </Button>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={contacts}
          keyExtractor={(row) => row.id}
          emptyState={
            <EmptyState
              icon={<Building2 size={36} />}
              title="No hospitals invited yet"
              description="Hospitals will appear here once they are invited to quote on this case."
            />
          }
        />
      )}
    </Card>
  );
}

function QuoteComparisonCard({ caseId }: { caseId: string }) {
  const { data: raw, isLoading } = useCaseQuotesCompare(caseId);
  const quotes = (raw as Parameters<typeof QuoteComparison>[0]['quotes'] | undefined) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote Comparison</CardTitle>
        <span className="text-xs text-slate-400 italic">Read-only — patient accepts/rejects quotes</span>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <QuoteComparison quotes={quotes} />
      )}
    </Card>
  );
}

export function CaseQuotesTab({ caseId }: CaseQuotesTabProps) {
  return (
    <div className="space-y-6">
      <InvitedHospitalsCard caseId={caseId} />
      <QuoteComparisonCard caseId={caseId} />
    </div>
  );
}
