import { type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      consultationId?: string;
    };

    if (!body.consultationId) {
      return Response.json(
        { success: false, error: 'consultationId is required' },
        { status: 400 },
      );
    }

    const upstream = await apiFetch(`/api/v2/video-consultations/${body.consultationId}/token`, {
      method: 'POST',
      body: '{}',
    });
    const result = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    return Response.json(result, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/video-consultations/token failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
