import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';
import { CasesList } from '@/components/cases-list';

const EMPTY_CASES: PaginatedResponse<CaseSummary> = { data: [] };
const EMPTY_STATS: CaseStats = {};

export default async function CasesPage() {
  // Use Promise.allSettled so one API failure does not crash the entire page.
  const [casesResult, statsResult] = await Promise.allSettled([
    apiClient<PaginatedResponse<CaseSummary>>('/api/v2/cases?page=1&limit=20'),
    apiClient<CaseStats>('/api/v2/cases/stats'),
  ]);

  const cases = casesResult.status === 'fulfilled' ? casesResult.value : EMPTY_CASES;
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : EMPTY_STATS;

  if (casesResult.status === 'rejected') {
    console.error('[CasesPage] Failed to load cases:', casesResult.reason);
  }
  if (statsResult.status === 'rejected') {
    console.error('[CasesPage] Failed to load stats:', statsResult.reason);
  }

  return <CasesList initialCases={cases} initialStats={stats} />;
}
