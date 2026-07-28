import { type NextRequest } from 'next/server';
import { completeVideoConsultation, requireAdminSession } from '@/lib/supabase-main';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const consultation = await completeVideoConsultation(id);
    return Response.json({ success: true, consultation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'unauthorized') {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/video-consultations/[id]/complete failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
