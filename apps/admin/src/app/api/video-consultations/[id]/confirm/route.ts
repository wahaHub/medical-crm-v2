import { type NextRequest } from 'next/server';
import { updateVideoConsultationStatus, requireAdminSession } from '@/lib/supabase-main';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const consultation = await updateVideoConsultationStatus(id, 'SCHEDULED', body.note);
    return Response.json({ success: true, consultation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'unauthorized') {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/video-consultations/[id]/confirm failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
