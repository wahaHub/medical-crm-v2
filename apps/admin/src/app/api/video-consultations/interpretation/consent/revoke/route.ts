import { type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      consultationId?: string;
      participantIdentity?: string;
      witnessConfirmed?: boolean;
    };
    if (!body.consultationId || !body.participantIdentity || body.witnessConfirmed !== true) {
      return Response.json(
        { success: false, error: 'consultationId, participantIdentity, and withdrawal attestation are required' },
        { status: 400 },
      );
    }
    const upstream = await apiFetch(
      `/api/v2/video-consultations/${body.consultationId}/interpretation/consents/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({
          participantIdentity: body.participantIdentity,
          policyVersion: 'video-ai-consent-v1',
          witnessConfirmed: true,
        }),
      },
    );
    const data = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    return Response.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/video-consultations/interpretation/consent/revoke failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
