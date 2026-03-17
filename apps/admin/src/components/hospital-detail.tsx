'use client';

import { useState, useTransition } from 'react';
import {
  DataTable,
  StatusBadge,
  EmptyState,
  LoadingSpinner,
  Button,
  Modal,
  type Column,
} from '@medical-crm/ui';
import { HospitalReview } from './hospital-review';
import { useHospitalCases } from '@/queries/use-hospitals';
import { generateRegistrationToken } from '@/actions/hospital-actions';
import type { HospitalSummary, CaseSummary } from '@/lib/api-types';
import { useRouter } from 'next/navigation';

interface HospitalDetailProps {
  hospital: HospitalSummary;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const CASE_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const casesColumns: Column<CaseSummary>[] = [
  {
    key: 'caseNumber',
    header: 'Case #',
    render: (row) => (
      <span className="font-mono text-sm font-semibold text-indigo-600">{row.caseNumber}</span>
    ),
  },
  {
    key: 'patientName',
    header: 'Patient Name',
    render: (row) => <span className="font-medium text-slate-900">{row.patientName}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status} colorMap={CASE_STATUS_COLORS} />,
  },
  {
    key: 'treatmentStage',
    header: 'Treatment Stage',
    render: (row) => (
      <span className="text-sm text-slate-600">
        {row.treatmentStage
          ? row.treatmentStage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
          : '—'}
      </span>
    ),
  },
  {
    key: 'createdAt',
    header: 'Created',
    render: (row) => (
      <span className="text-sm text-slate-500">{formatDate(row.createdAt)}</span>
    ),
  },
];

function RegistrationLinkSection({ hospitalId }: { hospitalId: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ token: string; registrationUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal() {
    setEmail('');
    setResult(null);
    setError(null);
    setModalOpen(true);
  }

  function handleGenerate() {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const data = await generateRegistrationToken(hospitalId, email.trim());
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate token');
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Registration Link</h3>
          <p className="mt-1 text-sm text-slate-500">Generate a registration link to invite this hospital.</p>
        </div>
        <Button variant="outline" size="sm" onClick={openModal}>
          Regenerate Token
        </Button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Generate Registration Link" maxWidth="max-w-lg">
        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Registration link generated successfully. Share this link with the hospital:</p>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="break-all font-mono text-xs text-slate-700">{result.registrationUrl}</p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(result.registrationUrl);
                }}
              >
                Copy Link
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Enter the email address for the hospital representative.</p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="reg-email">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hospital@example.com"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="default" onClick={handleGenerate} disabled={isPending || !email.trim()}>
                {isPending ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AssociatedCases({ hospitalId }: { hospitalId: string }) {
  const [page, setPage] = useState(1);
  const router = useRouter();
  const { data, isPending } = useHospitalCases(hospitalId, { page: String(page), limit: '10' });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <DataTable<CaseSummary>
      columns={casesColumns}
      data={data?.data ?? []}
      keyExtractor={(row) => row.id}
      onRowClick={(row) => router.push(`/cases/${row.id}`)}
      pagination={
        data && data.total > 0
          ? { page: data.page, pageSize: data.limit, total: data.total }
          : undefined
      }
      onPageChange={(p) => setPage(p)}
      emptyState={
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          }
          title="No cases"
          description="This hospital has no associated cases yet."
        />
      }
    />
  );
}

export function HospitalDetail({ hospital }: HospitalDetailProps) {
  return (
    <div className="space-y-6">
      {/* Basic Info Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Basic Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
            <p className="mt-1 text-sm text-slate-900">{hospital.name}</p>
          </div>
          {hospital.nameEn && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">English Name</span>
              <p className="mt-1 text-sm text-slate-900">{hospital.nameEn}</p>
            </div>
          )}
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Type</span>
            <p className="mt-1 text-sm text-slate-900">{hospital.type}</p>
          </div>
          {hospital.city && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">City</span>
              <p className="mt-1 text-sm text-slate-900">{hospital.city}</p>
            </div>
          )}
          {hospital.address && (
            <div className="sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Address</span>
              <p className="mt-1 text-sm text-slate-900">{hospital.address}</p>
            </div>
          )}
          {hospital.phone && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Phone</span>
              <p className="mt-1 text-sm text-slate-900">{hospital.phone}</p>
            </div>
          )}
          {hospital.email && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
              <p className="mt-1 text-sm text-slate-900">{hospital.email}</p>
            </div>
          )}
        </div>

        {/* Specialties */}
        {hospital.specialties && hospital.specialties.length > 0 && (
          <div className="mt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Specialties</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {hospital.specialties.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Management */}
      <HospitalReview hospitalId={hospital.id} currentStatus={hospital.status} />

      {/* Registration Link */}
      <RegistrationLinkSection hospitalId={hospital.id} />

      {/* Associated Cases */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Associated Cases</h3>
        <AssociatedCases hospitalId={hospital.id} />
      </div>
    </div>
  );
}
