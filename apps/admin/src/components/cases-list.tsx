'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  StatCard,
  DataTable,
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
  Button,
  type Column,
} from '@medical-crm/ui';
import { useCases } from '@/queries/use-cases';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';

interface CasesListProps {
  initialCases: PaginatedResponse<CaseSummary>;
  initialStats: CaseStats;
}

const ASSIGNMENT_STATUS_OPTIONS = [
  { value: '', label: 'All Assignment Status' },
  { value: 'UNASSIGNED', label: 'Unassigned' },
  { value: 'ASSIGNED', label: 'Assigned' },
];

const TREATMENT_STAGE_OPTIONS = [
  { value: '', label: 'All Treatment Stages' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_TREATMENT', label: 'In Treatment' },
  { value: 'POST_TREATMENT', label: 'Post Treatment' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
];

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statCardConfigs: Array<{
  key: keyof CaseStats;
  label: string;
  colorClass: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'total',
    label: 'Total Cases',
    colorClass: 'text-indigo-600 bg-indigo-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
      </svg>
    ),
  },
  {
    key: 'unassigned',
    label: 'Unassigned',
    colorClass: 'text-amber-600 bg-amber-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    key: 'assigned',
    label: 'Assigned',
    colorClass: 'text-emerald-600 bg-emerald-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    key: 'inTreatment',
    label: 'In Treatment',
    colorClass: 'text-cyan-600 bg-cyan-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    key: 'postTreatment',
    label: 'Post Treatment',
    colorClass: 'text-purple-600 bg-purple-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'completed',
    label: 'Completed',
    colorClass: 'text-green-600 bg-green-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  {
    key: 'followUp',
    label: 'Follow Up',
    colorClass: 'text-rose-600 bg-rose-50',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const columns: Column<CaseSummary>[] = [
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
    render: (row) => <StatusBadge status={row.status} />,
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
    key: 'assignmentStatus',
    header: 'Assignment',
    render: (row) => <StatusBadge status={row.assignmentStatus} />,
  },
  {
    key: 'createdAt',
    header: 'Created',
    render: (row) => (
      <span className="text-sm text-slate-500">{formatDate(row.createdAt)}</span>
    ),
  },
];

export function CasesList({ initialCases, initialStats }: CasesListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState('');
  const [treatmentStage, setTreatmentStage] = useState('');
  const [page, setPage] = useState(1);

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (search) filters.search = search;
  if (assignmentStatus) filters.assignmentStatus = assignmentStatus;
  if (treatmentStage) filters.treatmentStage = treatmentStage;

  const hasActiveFilters = !!search || !!assignmentStatus || !!treatmentStage || page !== 1;
  const { data, isPending } = useCases(filters);
  const cases = (data ?? (hasActiveFilters ? { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false } : initialCases));

  return (
    <div className="space-y-6">
      {/* Stat Cards — 7 cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
        {statCardConfigs.map((cfg) => (
          <StatCard
            key={cfg.key}
            icon={cfg.icon}
            value={initialStats[cfg.key] ?? 0}
            label={cfg.label}
            colorClass={cfg.colorClass}
          />
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search case number, patient name..."
          debounceMs={300}
          className="flex-1 min-w-[240px] max-w-xl"
        />
        <select
          value={assignmentStatus}
          onChange={(e) => { setAssignmentStatus(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={treatmentStage}
          onChange={(e) => { setTreatmentStage(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {TREATMENT_STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button variant="default" size="sm" onClick={() => router.push('/cases/new')}>
          New Case
        </Button>
      </div>

      {/* Data Table */}
      {hasActiveFilters && isPending ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <DataTable<CaseSummary>
          columns={columns}
          data={cases.data ?? []}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/cases/${row.id}`)}
          pagination={
            cases.total > 0
              ? { page: cases.page, pageSize: cases.limit, total: cases.total }
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
              title="No cases found"
              description="No cases match your current filters. Try adjusting your search."
            />
          }
        />
      )}
    </div>
  );
}
