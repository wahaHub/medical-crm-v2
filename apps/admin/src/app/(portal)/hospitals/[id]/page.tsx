import { notFound } from 'next/navigation';
import { PageHeader, Button } from '@medical-crm/ui';
import { apiFetch } from '@/lib/api-fetch';
import { HospitalDetail } from '@/components/hospital-detail';
import type { HospitalSummary } from '@/lib/api-types';
import Link from 'next/link';

interface HospitalDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function HospitalDetailPage({ params }: HospitalDetailPageProps) {
  const { id } = await params;

  let res: Response;
  try {
    res = await apiFetch(`/api/v2/hospitals/${id}`);
  } catch (error) {
    console.error('[HospitalDetailPage] Fetch failed:', error);
    return (
      <div className="p-8">
        <PageHeader title="Error" />
        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800">Failed to connect to API</h2>
          <p className="mt-2 text-sm text-red-600">The API server may be down or unreachable.</p>
          <Link href="/hospitals" className="mt-4 inline-block">
            <Button variant="outline" size="sm">← Back to Hospitals</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    return (
      <div className="p-8">
        <PageHeader title="Error" />
        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800">Failed to load hospital</h2>
          <p className="mt-2 text-sm text-red-600">Status: {res.status}</p>
          <Link href="/hospitals" className="mt-4 inline-block">
            <Button variant="outline" size="sm">← Back to Hospitals</Button>
          </Link>
        </div>
      </div>
    );
  }

  let hospital: HospitalSummary;
  try {
    hospital = await res.json() as HospitalSummary;
  } catch (error) {
    console.error('[HospitalDetailPage] JSON parse failed:', error);
    return (
      <div className="p-8">
        <PageHeader title="Error" />
        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800">Invalid API response</h2>
          <p className="mt-2 text-sm text-red-600">The API returned an unexpected response format.</p>
          <Link href="/hospitals" className="mt-4 inline-block">
            <Button variant="outline" size="sm">← Back to Hospitals</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={hospital.name}
        subtitle={hospital.nameEn ?? undefined}
        actions={
          <Link href="/hospitals">
            <Button variant="outline" size="sm">
              ← Back to Hospitals
            </Button>
          </Link>
        }
      />
      <HospitalDetail hospital={hospital} />
    </>
  );
}
