import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import type { HospitalCaseDetail } from '@/lib/api-types';
import { CaseDetailPanel } from '@/components/case-detail-panel';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let response: Response;

  try {
    response = await apiFetch(`/api/v2/cases/${id}`);
  } catch (error) {
    console.error('[HospitalCaseDetailPage] Failed to fetch case detail:', error);
    throw new Error('Failed to load case details');
  }

  if (response.status === 401) {
    redirect('/auth/login');
  }

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    console.error('[HospitalCaseDetailPage] Failed to load case detail:', response.status);
    throw new Error('Failed to load case details');
  }

  const caseDetail = await response.json() as HospitalCaseDetail;

  return <CaseDetailPanel caseDetail={caseDetail} />;
}
