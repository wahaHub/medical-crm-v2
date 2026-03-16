import { apiClient } from '@/lib/api-client';
import type {
  PaginatedResponse,
  CaseSummary,
  ConsultationSummary,
  ConversationSummary,
  CaseStats,
  ConsultationStats,
} from '@/lib/api-types';
import { PageHeader } from '@medical-crm/ui';
import { DashboardWidgets } from '@/components/dashboard-widgets';

export default async function DashboardPage() {
  const [cases, consultations, caseStats, consultationStats, conversations] = await Promise.all([
    apiClient<PaginatedResponse<CaseSummary>>('/api/v2/cases?limit=5&sort=createdAt:desc'),
    apiClient<PaginatedResponse<ConsultationSummary>>('/api/v2/consultations?status=SCHEDULED&limit=5'),
    apiClient<CaseStats>('/api/v2/cases/stats'),
    apiClient<ConsultationStats>('/api/v2/consultations/stats'),
    apiClient<PaginatedResponse<ConversationSummary>>('/api/v2/conversations?limit=5'),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle="Welcome back" />
      <DashboardWidgets
        data={{
          caseStats: {
            total: caseStats.total ?? 0,
            new: caseStats.new ?? 0,
            inProgress: caseStats.inProgress ?? 0,
            completed: caseStats.completed ?? 0,
          },
          consultationStats: {
            total: consultationStats.total ?? 0,
            scheduled: consultationStats.scheduled ?? 0,
            completed: consultationStats.completed ?? 0,
          },
          recentCases: (cases.data ?? []).map((c) => ({
            id: c.id,
            caseNumber: c.caseNumber ?? '',
            patientName: c.patientName ?? 'Unknown',
            status: c.status ?? 'UNKNOWN',
            createdAt: c.createdAt ?? '',
          })),
          scheduledConsultations: (consultations.data ?? []).map((c) => ({
            id: c.id,
            patientName: c.patientName ?? 'Unknown',
            scheduledAt: c.scheduledAt ?? '',
            status: c.status ?? 'UNKNOWN',
          })),
          pendingMessages: (conversations.data ?? []).map((c) => ({
            id: c.id,
            patientName: c.patientName ?? 'Unknown',
            lastMessage: c.lastMessagePreview ?? '',
            updatedAt: c.updatedAt ?? '',
          })),
        }}
      />
    </div>
  );
}
