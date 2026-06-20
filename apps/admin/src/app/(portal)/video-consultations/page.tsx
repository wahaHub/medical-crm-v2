import { PageHeader } from '@medical-crm/ui';
import { listVideoConsultations, requireAdminSession } from '@/lib/supabase-main';
import { VideoConsultationsList } from '@/components/video-consultations-list';
import type { VideoConsultationListResponse } from '@/lib/video-consultation-types';

export default async function VideoConsultationsPage() {
  let initial: VideoConsultationListResponse;
  try {
    await requireAdminSession();
    const consultations = await listVideoConsultations();
    initial = { success: true, consultations };
  } catch (err) {
    console.error('[VideoConsultationsPage] Error:', err);
    initial = { success: true, consultations: [] };
  }

  return (
    <>
      <PageHeader
        title="Video Consultations"
        subtitle="Review, confirm, and join scheduled video consultations."
      />
      <div className="mt-6">
        <VideoConsultationsList initialData={initial} />
      </div>
    </>
  );
}
