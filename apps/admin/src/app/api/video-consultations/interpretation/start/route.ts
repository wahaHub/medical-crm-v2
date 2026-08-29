import { type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      consultationId?: string;
      participantIdentities?: string[];
      sourceLanguage?: 'zh' | 'en';
      consentWitnessConfirmed?: boolean;
    };

    if (!body.consultationId || !Array.isArray(body.participantIdentities)
      || body.participantIdentities.length < 2 || body.consentWitnessConfirmed !== true) {
      return Response.json(
        { success: false, error: 'consultationId, two participants, and explicit consent attestation are required' },
        { status: 400 },
      );
    }

    const consentResponse = await apiFetch(
      `/api/v2/video-consultations/${body.consultationId}/interpretation/consents`, {
      method: 'POST',
      body: JSON.stringify({
        participantIdentities: body.participantIdentities,
        policyVersion: 'video-ai-consent-v1',
        witnessConfirmed: true,
      }),
    });
    if (!consentResponse.ok) {
      const error = await consentResponse.json().catch(() => ({ error: 'consent_failed' }));
      return Response.json(error, { status: consentResponse.status });
    }

    const upstream = await apiFetch(
      `/api/v2/video-consultations/${body.consultationId}/interpretation/start`, {
        method: 'POST',
        body: JSON.stringify({ sourceLanguage: body.sourceLanguage }),
      },
    );
    const data = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    return Response.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/video-consultations/interpretation/start failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
