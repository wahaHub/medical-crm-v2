import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@medical-crm/ui';
import { CasesList } from '@/components/cases-list';

export default async function CasesPage() {
  const [cases, stats] = await Promise.all([
    apiClient<any>('/api/v2/cases?page=1&limit=20'),
    apiClient<any>('/api/v2/cases/stats'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Cases" subtitle="Manage patient cases" />
      <CasesList initialCases={cases} initialStats={stats} />
    </div>
  );
}
