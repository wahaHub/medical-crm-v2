import { type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { consultationId?: string };
    if (!body.consultationId) {
      return Response.json({ success: false, error: 'consultationId is required' }, { status: 400 });
    }
    const upstream = await apiFetch(
      `/api/v2/video-consultations/${body.consultationId}/interpretation/escalate`,
      { method: 'POST', body: '{}' },
    );
    const data = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('POST /api/video-consultations/interpretation/escalate failed:', error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
