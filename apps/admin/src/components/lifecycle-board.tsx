'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LoadingSpinner } from '@medical-crm/ui';
import { Search } from 'lucide-react';
import { useCases } from '@/queries/use-cases';
import { useHospitalNameMap } from '@/queries/use-hospital-names';
import { formatDateTime } from '@/lib/date-format';
import type { CaseSummary, PaginatedResponse } from '@/lib/api-types';

const STAGE_COLUMNS = [
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'IN_TREATMENT', label: 'In Treatment' },
  { key: 'POST_TREATMENT', label: 'Post Treatment' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'FOLLOW_UP', label: 'Follow Up' },
] as const;

type StageKey = (typeof STAGE_COLUMNS)[number]['key'];

function daysInStage(caseItem: CaseSummary): number | null {
  const reference = caseItem.updatedAt ?? caseItem.createdAt;
  if (!reference) return null;
  const startedAt = new Date(reference).getTime();
  if (Number.isNaN(startedAt)) return null;
  return Math.max(0, Math.floor((Date.now() - startedAt) / (1000 * 60 * 60 * 24)));
}

function LifecycleColumn({
  stage,
  filters,
}: {
  stage: { key: StageKey; label: string };
  filters: Record<string, string>;
}) {
  const { data, isLoading, error } = useCases({ ...filters, treatmentStage: stage.key });
  const cases = (data as PaginatedResponse<CaseSummary> | undefined)?.data ?? [];
  // The list DTO only carries assignedHospitalId; resolve display names per column
  const hospitalIds = cases.map((caseItem) => caseItem.assignedHospitalId);
  const { nameMap: hospitalNameMap } = useHospitalNameMap(hospitalIds);

  return (
    <div className="flex min-w-[240px] flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50/60">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{stage.label}</h2>
        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">
          {cases.length}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="sm" />
          </div>
        ) : error ? (
          <p className="px-2 py-4 text-center text-xs text-rose-600">
            {error instanceof Error ? error.message : 'Failed to load cases'}
          </p>
        ) : cases.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-slate-400">No cases</p>
        ) : (
          cases.map((caseItem) => (
            <LifecycleCard
              key={caseItem.id}
              caseItem={caseItem}
              hospitalName={
                caseItem.hospitalName
                ?? (caseItem.assignedHospitalId ? hospitalNameMap[caseItem.assignedHospitalId] : undefined)
                ?? null
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function LifecycleCard({ caseItem, hospitalName }: { caseItem: CaseSummary; hospitalName: string | null }) {
  const days = daysInStage(caseItem);

  return (
    <Link
      href={`/cases/${caseItem.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-200 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-800">{caseItem.patientName}</p>
        {days !== null && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
            {days}d
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{caseItem.caseNumber}</p>
      <div className="mt-2 space-y-1 text-xs text-slate-500">
        <p className="truncate">
          <span className="text-slate-400">Hospital: </span>
          {hospitalName ?? <span className="text-slate-300">—</span>}
        </p>
        <p>
          <span className="text-slate-400">Last activity: </span>
          {caseItem.updatedAt ? formatDateTime(caseItem.updatedAt) : '—'}
        </p>
      </div>
    </Link>
  );
}

export function LifecycleBoard() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [patientSite, setPatientSite] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(() => {
    const result: Record<string, string> = { limit: '100' };
    if (search) result.search = search;
    if (patientSite) result.patientSite = patientSite;
    return result;
  }, [search, patientSite]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search patient, case number, diagnosis"
            className="w-72 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <select
          value={patientSite}
          onChange={(e) => setPatientSite(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All sites</option>
          <option value="beauty">Beauty</option>
          <option value="china">China</option>
        </select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {STAGE_COLUMNS.map((stage) => (
          <LifecycleColumn key={stage.key} stage={stage} filters={filters} />
        ))}
      </div>
    </div>
  );
}
