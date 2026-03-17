import { PageHeader } from '@medical-crm/ui';
import { apiFetch } from '@/lib/api-fetch';
import type { PaginatedResponse, HospitalSummary } from '@/lib/api-types';
import { HospitalsList } from '@/components/hospitals-list';

const EMPTY_HOSPITALS: PaginatedResponse<HospitalSummary> = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 0,
  hasMore: false,
};

export default async function HospitalsPage() {
  const result = await apiFetch('/api/v2/hospitals?page=1&limit=20').then((r) =>
    r.ok ? (r.json() as Promise<PaginatedResponse<HospitalSummary>>) : Promise.reject(r.status),
  ).catch((err) => {
    console.error('[HospitalsPage] Failed to load hospitals:', err);
    return EMPTY_HOSPITALS;
  });

  return (
    <>
      <PageHeader title="Hospitals" />
      <HospitalsList initialHospitals={result} />
    </>
  );
}
