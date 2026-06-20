import { type NextRequest } from 'next/server';
import { listVideoConsultations, requireAdminSession } from '@/lib/supabase-main';

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const status = request.nextUrl.searchParams.get('status') ?? undefined;
    const doctorId = request.nextUrl.searchParams.get('doctorId') ?? undefined;
    const consultations = await listVideoConsultations({ status, doctorId });
    return Response.json({ success: true, consultations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'unauthorized') {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GET /api/video-consultations failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
