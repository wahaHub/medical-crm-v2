import { apiClient } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-fetch';
import type { PaginatedResponse, ConsultationSummary, ConsultationStats, CaseSummary } from '@/lib/api-types';
import { ConsultationsList } from '@/components/consultations-list';
import { loadMessages, normalizeLocale, translateMessage } from '@medical-crm/i18n';

const EMPTY_CONSULTATIONS: PaginatedResponse<ConsultationSummary> = { data: [] };
const EMPTY_STATS: ConsultationStats = {};
const EMPTY_CASES: PaginatedResponse<CaseSummary> = { data: [] };

interface UserProfileResponse {
  preferredLanguage?: string;
}

export default async function ConsultationsPage() {
  const profile = await apiFetch('/api/v2/users/me')
    .then(async (profileRes) => (
      profileRes.ok
        ? await profileRes.json() as UserProfileResponse
        : null
    ))
    .catch((error) => {
      console.error('[ConsultationsPage] Failed to load user profile:', error);
      return null;
    });
  const locale = normalizeLocale(profile?.preferredLanguage);
  const messages = await loadMessages(locale);

  // Use Promise.allSettled so one API failure does not crash the entire page.
  const [consultationsResult, statsResult, casesResult] = await Promise.allSettled([
    apiClient<PaginatedResponse<ConsultationSummary>>('/api/v2/consultations?status=SCHEDULED&limit=20'),
    apiClient<ConsultationStats>('/api/v2/consultations/stats'),
    apiClient<PaginatedResponse<CaseSummary>>('/api/v2/cases?limit=100'),
  ]);

  const consultations = consultationsResult.status === 'fulfilled' ? consultationsResult.value : EMPTY_CONSULTATIONS;
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : EMPTY_STATS;
  const cases = casesResult.status === 'fulfilled' ? casesResult.value : EMPTY_CASES;

  // Log failures for debugging without crashing the page
  if (consultationsResult.status === 'rejected') {
    console.error('[ConsultationsPage] Failed to load consultations:', consultationsResult.reason);
  }
  if (statsResult.status === 'rejected') {
    console.error('[ConsultationsPage] Failed to load stats:', statsResult.reason);
  }
  if (casesResult.status === 'rejected') {
    console.error('[ConsultationsPage] Failed to load cases:', casesResult.reason);
  }

  // Build a map from caseId → patientName for enriching consultations
  const caseMap = new Map<string, string>();
  for (const c of cases?.data ?? []) {
    if (c.id && c.patientName) caseMap.set(c.id, c.patientName);
  }

  // Enrich consultations with patient names from cases
  const enrichedData: PaginatedResponse<ConsultationSummary> = {
    ...consultations,
    data: (consultations.data ?? []).map((c) => ({
      ...c,
      patientName: c.patientName || caseMap.get(c.caseId ?? '') || undefined,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {translateMessage(messages, 'hospital.portal.consultations.page.title', undefined, 'Consultations')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {translateMessage(
              messages,
              'hospital.portal.consultations.page.description',
              undefined,
              'Manage and review patient video consultations',
            )}
          </p>
        </div>
      </div>
      <ConsultationsList initialData={enrichedData} initialStats={stats} caseMap={Object.fromEntries(caseMap)} cases={cases?.data ?? []} />
    </div>
  );
}
