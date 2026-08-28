import { Suspense } from 'react';
import { PageHeader, LoadingSpinner } from '@medical-crm/ui';
import { apiFetch } from '@/lib/api-fetch';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';
import { CasesViewSwitcher } from '@/components/cases-view-switcher';

const EMPTY_CASES: PaginatedResponse<CaseSummary> = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 0,
  hasMore: false,
};

const EMPTY_STATS: CaseStats = {
  total: 0,
  unassigned: 0,
  assigned: 0,
  inTreatment: 0,
  postTreatment: 0,
  completed: 0,
  followUp: 0,
};

export default async function CasesPage() {
  const [casesResult, statsResult] = await Promise.allSettled([
    apiFetch('/api/v2/cases?page=1&limit=20').then((r) =>
      r.ok ? (r.json() as Promise<PaginatedResponse<CaseSummary>>) : Promise.reject(r.status),
    ),
    apiFetch('/api/v2/cases/stats').then((r) =>
      r.ok ? (r.json() as Promise<CaseStats>) : Promise.reject(r.status),
    ),
  ]);

  if (casesResult.status === 'rejected') {
    console.error('[CasesPage] Failed to load cases:', casesResult.reason);
  }
  if (statsResult.status === 'rejected') {
    console.error('[CasesPage] Failed to load stats:', statsResult.reason);
  }

  const cases = casesResult.status === 'fulfilled' ? casesResult.value : EMPTY_CASES;
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : EMPTY_STATS;

  return (
    <>
      <PageHeader title="Cases" />
      <Suspense fallback={<div className="flex justify-center py-10"><LoadingSpinner /></div>}>
        <CasesViewSwitcher initialCases={cases} initialStats={stats} />
      </Suspense>
    </>
  );
}
