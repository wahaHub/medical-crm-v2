'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DataTable,
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
  Button,
  type Column,
} from '@medical-crm/ui';
import { useHospitals } from '@/queries/use-hospitals';
import type { PaginatedResponse, HospitalSummary } from '@/lib/api-types';

interface HospitalsListProps {
  initialHospitals: PaginatedResponse<HospitalSummary>;
}

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'COSMETIC', label: 'Cosmetic' },
  { value: 'REGULAR', label: 'Regular' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const HOSPITAL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
};

const HOSPITAL_TYPE_COLORS: Record<string, string> = {
  COSMETIC: 'bg-pink-50 text-pink-700',
  REGULAR: 'bg-blue-50 text-blue-700',
};

const HOSPITAL_SITE_COLORS: Record<string, string> = {
  cosmetic: 'bg-pink-50 text-pink-700',
  china: 'bg-red-50 text-red-700',
  global: 'bg-emerald-50 text-emerald-700',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const columns: Column<HospitalSummary>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (row) => (
      <span className="font-medium text-slate-900">{row.name}</span>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    render: (row) => (
      <StatusBadge status={row.type} colorMap={HOSPITAL_TYPE_COLORS} />
    ),
  },
  {
    key: 'site',
    header: 'Site',
    render: (row) => (
      <StatusBadge status={row.site ?? 'unset'} colorMap={HOSPITAL_SITE_COLORS} />
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge status={row.status} colorMap={HOSPITAL_STATUS_COLORS} />
    ),
  },
  {
    key: 'specialties',
    header: 'Specialties',
    render: (row) => (
      <div className="flex flex-wrap gap-1">
        {(row.specialties ?? []).slice(0, 3).map((s) => (
          <span
            key={s}
            className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
          >
            {s}
          </span>
        ))}
        {(row.specialties ?? []).length > 3 && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            +{(row.specialties ?? []).length - 3}
          </span>
        )}
      </div>
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

export function HospitalsList({ initialHospitals }: HospitalsListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (search) filters.search = search;
  if (type) filters.type = type;
  if (status) filters.status = status;

  const hasActiveFilters = !!search || !!type || !!status || page !== 1;
  const { data, isPending } = useHospitals(filters);
  const hospitals = data ?? (hasActiveFilters
    ? { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false }
    : initialHospitals);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search hospital name..."
          debounceMs={300}
          className="flex-1 min-w-[240px] max-w-xl"
        />
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button variant="default" size="sm" onClick={() => router.push('/hospitals/new')}>
          New Hospital
        </Button>
      </div>

      {/* Data Table */}
      {hasActiveFilters && isPending ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <DataTable<HospitalSummary>
          columns={columns}
          data={hospitals.data ?? []}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/hospitals/${row.id}`)}
          pagination={
            hospitals.total > 0
              ? { page: hospitals.page, pageSize: hospitals.limit, total: hospitals.total }
              : undefined
          }
          onPageChange={(p) => setPage(p)}
          emptyState={
            <EmptyState
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              title="No hospitals found"
              description="No hospitals match your current filters. Try adjusting your search."
            />
          }
        />
      )}
    </div>
  );
}
