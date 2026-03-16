import { apiClient } from '@/lib/api-client';
import type { HospitalCaseDetail } from '@/lib/api-types';
import { CaseDetailPanel } from '@/components/case-detail-panel';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseDetail = await apiClient<HospitalCaseDetail>(`/api/v2/cases/${id}`);

  return <CaseDetailPanel caseDetail={caseDetail} />;
}
