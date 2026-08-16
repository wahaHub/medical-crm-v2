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
  const isMerged = caseData.status === 'MERGED' || Boolean(caseData.mergedIntoCaseId);

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
      {isMerged ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This case has been merged
          {caseData.mergedIntoCaseId ? (
            <>
              {' into '}
              <Link
                href={`/cases/${caseData.mergedIntoCaseId}`}
                className="font-semibold underline hover:text-amber-700"
              >
                #{caseData.mergedIntoCaseNumber ?? caseData.mergedIntoCaseId}
              </Link>
            </>
          ) : null}
          . It is read-only history and no longer appears in case lists or the lifecycle board.
        </div>
      ) : null}
      <CaseDetailTabs caseData={caseData} />
    </>
  );
}
