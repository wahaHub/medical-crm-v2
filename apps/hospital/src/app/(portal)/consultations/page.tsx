import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse, ConsultationSummary, ConsultationStats } from '@/lib/api-types';
import { PageHeader } from '@medical-crm/ui';
import { ConsultationsList } from '@/components/consultations-list';

export default async function ConsultationsPage() {
  const [consultations, stats] = await Promise.all([
    apiClient<PaginatedResponse<ConsultationSummary>>('/api/v2/consultations?status=SCHEDULED&limit=20'),
    apiClient<ConsultationStats>('/api/v2/consultations/stats'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Consultations" subtitle="Manage video consultations" />
      <ConsultationsList initialData={consultations} initialStats={stats} />
    </div>
  );
}
