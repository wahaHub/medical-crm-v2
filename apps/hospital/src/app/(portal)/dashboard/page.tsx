import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@medical-crm/ui';
import { DashboardWidgets } from '@/components/dashboard-widgets';

export default async function DashboardPage() {
  const [cases, consultations, caseStats, consultationStats, conversations] = await Promise.all([
    apiClient<{ data: any[] }>('/api/v2/cases?limit=5&sort=createdAt:desc'),
    apiClient<{ data: any[] }>('/api/v2/consultations?status=SCHEDULED&limit=5'),
    apiClient<any>('/api/v2/cases/stats'),
    apiClient<any>('/api/v2/consultations/stats'),
    apiClient<{ data: any[] }>('/api/v2/conversations?limit=5'),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle="Welcome back" />
      <DashboardWidgets
        data={{
          caseStats,
          consultationStats,
          recentCases: cases.data ?? [],
          scheduledConsultations: consultations.data ?? [],
          pendingMessages: (conversations.data ?? []).map((c: any) => ({
            id: c.id,
            patientName: c.patientName ?? 'Unknown',
            lastMessage: c.lastMessagePreview ?? '',
            updatedAt: c.updatedAt,
          })),
        }}
      />
    </div>
  );
}
