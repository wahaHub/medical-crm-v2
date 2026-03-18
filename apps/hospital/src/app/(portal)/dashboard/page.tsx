import { apiClient } from '@/lib/api-client';
import type {
  PaginatedResponse,
  CaseSummary,
  ConversationSummary,
} from '@/lib/api-types';
import { DashboardWidgets } from '@/components/dashboard-widgets';

// Raw consultation DTO from backend (has caseId, durationMinutes, aiTranslation)
interface RawConsultation {
  id: string;
  caseId?: string;
  patientId?: string;
  patientName?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  aiTranslation?: boolean;
  status?: string;
  notes?: string | null;
}

const EMPTY_CASES: PaginatedResponse<CaseSummary> = { data: [] };
const EMPTY_CONSULTATIONS: PaginatedResponse<RawConsultation> = { data: [] };
const EMPTY_CONVERSATIONS: PaginatedResponse<ConversationSummary> = { data: [] };

export default async function DashboardPage() {
  // Use Promise.allSettled so one API failure does not crash the entire dashboard.
  const [casesResult, consultationsResult, conversationsResult] = await Promise.allSettled([
    apiClient<PaginatedResponse<CaseSummary>>('/api/v2/cases?limit=20'),
    apiClient<PaginatedResponse<RawConsultation>>('/api/v2/consultations?status=SCHEDULED&limit=5'),
    apiClient<PaginatedResponse<ConversationSummary>>('/api/v2/conversations?limit=5'),
  ]);

  const cases = casesResult.status === 'fulfilled' ? casesResult.value : EMPTY_CASES;
  const consultations = consultationsResult.status === 'fulfilled' ? consultationsResult.value : EMPTY_CONSULTATIONS;
  const conversations = conversationsResult.status === 'fulfilled' ? conversationsResult.value : EMPTY_CONVERSATIONS;

  // Log failures for debugging without crashing the page
  if (casesResult.status === 'rejected') {
    console.error('[DashboardPage] Failed to load cases:', casesResult.reason);
  }
  if (consultationsResult.status === 'rejected') {
    console.error('[DashboardPage] Failed to load consultations:', consultationsResult.reason);
  }
  if (conversationsResult.status === 'rejected') {
    console.error('[DashboardPage] Failed to load conversations:', conversationsResult.reason);
  }

  // Build caseId → case lookup for enrichment
  const caseMap = new Map<string, CaseSummary>();
  for (const c of cases.data ?? []) {
    caseMap.set(c.id, c);
  }

  // Enrich consultations with patient names from cases
  const enrichedConsultations = (consultations.data ?? []).map((c: RawConsultation) => {
    const linkedCase = c.caseId ? caseMap.get(c.caseId) : undefined;
    return {
      id: c.id,
      patientName: c.patientName ?? linkedCase?.patientName ?? 'Unknown',
      caseNumber: linkedCase?.caseNumber ?? '',
      scheduledAt: c.scheduledAt ?? '',
      durationMinutes: c.durationMinutes ?? 30,
      aiTranslation: c.aiTranslation ?? false,
      status: c.status ?? 'UNKNOWN',
    };
  });

  // Enrich conversations: extract patient name from title or cross-ref via case
  const enrichedMessages = (conversations.data ?? []).map((c: ConversationSummary) => {
    // Title format is typically "Patient Name - Topic"
    const titleName = c.title?.split(' - ')[0];
    return {
      id: c.id,
      patientName: c.patientName ?? titleName ?? 'Unknown',
      category: c.category ?? 'OTHER',
      lastMessage: c.lastMessagePreview ?? '',
      unreadCount: c.unreadCount ?? 0,
      updatedAt: c.updatedAt ?? '',
    };
  });

  // Get the 5 most recent cases for the "New Cases" widget
  // Backend CaseDTO sends `primaryDiagnosis`, frontend type uses `medicalCondition`
  const recentCases = (cases.data ?? []).slice(0, 5).map((c: CaseSummary) => {
    const raw = c as CaseSummary & { primaryDiagnosis?: string | null };
    return {
      id: c.id,
      caseNumber: c.caseNumber ?? '',
      patientName: c.patientName ?? 'Unknown',
      patientCountry: c.patientCountry ?? null,
      medicalCondition: raw.primaryDiagnosis ?? c.medicalCondition ?? null,
      status: c.status ?? 'UNKNOWN',
      createdAt: c.createdAt ?? '',
    };
  });

  return (
    <DashboardWidgets
      data={{
        scheduledConsultations: enrichedConsultations,
        recentCases,
        pendingMessages: enrichedMessages,
      }}
    />
  );
}
