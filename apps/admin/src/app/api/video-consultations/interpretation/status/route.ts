import { type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET(request: NextRequest) {
  try {
    const consultationId = request.nextUrl.searchParams.get('consultationId');
    if (!consultationId) {
      return Response.json({ success: false, error: 'consultationId is required' }, { status: 400 });
    }
    const upstream = await apiFetch(`/api/v2/video-consultations/${consultationId}/interpretation`);
    const data = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('GET /api/video-consultations/interpretation/status failed:', error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
