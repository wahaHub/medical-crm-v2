import { apiClient } from '@/lib/api-client';
import { CaseDetailPanel } from '@/components/case-detail-panel';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseDetail = await apiClient<any>(`/api/v2/cases/${id}`);

  return <CaseDetailPanel caseDetail={caseDetail} />;
}
