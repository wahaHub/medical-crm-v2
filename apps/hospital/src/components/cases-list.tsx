'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { StatCard, Tabs, SearchInput, StatusBadge, useDebounce } from '@medical-crm/ui';
import { useCases } from '@/queries/use-cases';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';

interface CasesListProps {
  initialCases: PaginatedResponse<CaseSummary>;
  initialStats: CaseStats;
}

const statusTabs = [
  { key: 'all', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Completed' },
];

export function CasesList({ initialCases, initialStats }: CasesListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (status !== 'all') filters.status = status;
  if (debouncedSearch) filters.search = debouncedSearch;

  const hasActiveFilters = status !== 'all' || !!debouncedSearch || page !== 1;
  const { data, isPending } = useCases(filters);
  // Only fall back to SSR data when no filters are active; otherwise show loading
  const cases = (data ?? (hasActiveFilters ? { data: [], total: 0 } : initialCases)) as PaginatedResponse<CaseSummary>;
  const stats = initialStats;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<FolderOpen size={24} />} value={stats.total ?? 0} label="Total Cases" />
        <StatCard icon={<FolderOpen size={24} />} value={stats.new ?? 0} label="New" colorClass="text-blue-600 bg-blue-50" />
        <StatCard icon={<FolderOpen size={24} />} value={stats.inProgress ?? 0} label="In Progress" colorClass="text-amber-600 bg-amber-50" />
        <StatCard icon={<FolderOpen size={24} />} value={stats.completed ?? 0} label="Completed" colorClass="text-emerald-600 bg-emerald-50" />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Tabs items={statusTabs} activeKey={status} onChange={(key) => { setStatus(key); setPage(1); }} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search cases..." debounceMs={300} className="w-64" />
      </div>

      {hasActiveFilters && isPending ? (
        <div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>
      ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(cases.data ?? []).map((c) => (
          <div
            key={c.id}
            onClick={() => router.push(`/cases/${c.id}`)}
            className="cursor-pointer rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-slate-500">{c.caseNumber}</span>
              <StatusBadge status={c.status ?? 'UNKNOWN'} />
            </div>
            <div className="mt-3">
              <div className="font-medium text-slate-900">{c.patientName ?? 'Unknown Patient'}</div>
              <div className="mt-1 text-sm text-slate-500">{c.medicalCondition ?? 'No condition specified'}</div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
