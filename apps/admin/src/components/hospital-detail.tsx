'use client';

import { useState, useTransition } from 'react';
import {
  DataTable,
  StatusBadge,
  EmptyState,
  LoadingSpinner,
  Button,
  type Column,
} from '@medical-crm/ui';
import { useHospitalCases } from '@/queries/use-hospitals';
import type { HospitalSummary, CaseSummary } from '@/lib/api-types';
import { updateHospitalStatus, generateRegistrationToken } from '@/actions/hospital-actions';
import { useRouter } from 'next/navigation';
import { buildConsumerShowcaseUrl } from '@/lib/consumer-showcase-link';

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

const HOSPITAL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
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

function ConsumerShowcaseLinkSection({ hospital }: { hospital: HospitalSummary }) {
  const [status, setStatus] = useState(hospital.status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const consumerUrl = buildConsumerShowcaseUrl(hospital);
  const nextStatus =
    status === 'PENDING'
      ? 'ACTIVE'
      : status === 'ACTIVE'
        ? 'INACTIVE'
        : 'ACTIVE';
  const actionLabel =
    status === 'PENDING'
      ? 'Approve'
      : status === 'ACTIVE'
        ? 'Revoke Approval'
        : 'Re-Approve';
  const pendingLabel =
    status === 'PENDING'
      ? 'Approving...'
      : status === 'ACTIVE'
        ? 'Revoking...'
        : 'Approving...';

  function handleStatusChange() {
    setError(null);
    startTransition(async () => {
      try {
        await updateHospitalStatus(hospital.id, nextStatus);
        setStatus(nextStatus);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : nextStatus === 'INACTIVE'
              ? 'Failed to revoke hospital approval'
              : 'Failed to approve hospital',
        );
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">
        消费者端展示页链接（按医院角色自动区分域名）
      </h3>
      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {consumerUrl ? (
            <a
              href={consumerUrl}
              target="_blank"
              rel="noreferrer"
              className="block break-all font-mono text-xs text-indigo-600 hover:text-indigo-700"
            >
              {consumerUrl}
            </a>
          ) : (
            <p className="break-all font-mono text-xs text-slate-500">
              Consumer page slug is not available yet.
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Domain policy: {hospital.type === 'REGULAR' ? 'REGULAR' : 'COSMETIC'} hospital
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={status} colorMap={HOSPITAL_STATUS_COLORS} />
          <Button
            variant={status === 'ACTIVE' ? 'secondary' : 'default'}
            size="sm"
            onClick={handleStatusChange}
            disabled={isPending}
          >
            {isPending ? pendingLabel : actionLabel}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function RegistrationInviteSection({ hospital }: { hospital: HospitalSummary }) {
  if (hospital.hasRegisteredUser) {
    return null;
  }

  const [email, setEmail] = useState(hospital.email ?? '');
  const [result, setResult] = useState<{ registrationUrl: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSendInvite() {
    setError(null);
    setResult(null);
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    startTransition(async () => {
      try {
        const payload = await generateRegistrationToken(hospital.id, normalizedEmail);
        setResult({ registrationUrl: payload.registrationUrl, expiresAt: payload.expiresAt });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send invitation email');
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">Hospital User Invitation</h3>
      <p className="mt-1 text-xs text-slate-500">
        Send registration email for hospital account setup.
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hospital-admin@example.com"
          className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
        />
        <Button variant="default" size="sm" onClick={handleSendInvite} disabled={isPending}>
          {isPending ? 'Sending...' : 'Send Invite Email'}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-semibold">Invite generated successfully.</p>
          <p className="mt-1">Expires: {new Date(result.expiresAt).toLocaleString()}</p>
          <p className="mt-1 break-all">
            Registration URL: <a className="underline" href={result.registrationUrl} target="_blank" rel="noreferrer">{result.registrationUrl}</a>
          </p>
        </div>
      )}
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

      {/* Consumer Link + Review */}
      <ConsumerShowcaseLinkSection hospital={hospital} />

      {/* Registration Invite */}
      <RegistrationInviteSection hospital={hospital} />

      {/* Associated Cases */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Associated Cases</h3>
        <AssociatedCases hospitalId={hospital.id} />
      </div>
    </div>
  );
}
