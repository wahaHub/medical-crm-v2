import { notFound } from 'next/navigation';
import { PageHeader, Button } from '@medical-crm/ui';
import { apiFetch } from '@/lib/api-fetch';
import { CaseDetailTabs } from '@/components/case-detail-tabs';
import type { CaseSummary } from '@/lib/api-types';
import Link from 'next/link';

interface CaseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;

  const res = await apiFetch(`/api/v2/cases/${id}`);

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    throw new Error(`Failed to load case: ${res.status}`);
  }

  const caseData = (await res.json()) as CaseSummary;

  return (
    <>
      <PageHeader
        title={`Case #${caseData.caseNumber}`}
        subtitle={caseData.patientName}
        actions={
          <Link href="/cases">
            <Button variant="outline" size="sm">
              ← Back to Cases
            </Button>
          </Link>
        }
      />
      <CaseDetailTabs caseData={caseData} />
    </>
  );
}
