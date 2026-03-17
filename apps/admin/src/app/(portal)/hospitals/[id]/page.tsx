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

  const res = await apiFetch(`/api/v2/hospitals/${id}`);

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    throw new Error(`Failed to load hospital: ${res.status}`);
  }

  const hospital = (await res.json()) as HospitalSummary;

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
