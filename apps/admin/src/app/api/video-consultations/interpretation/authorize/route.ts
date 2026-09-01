import { type NextRequest } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

interface ActiveApproval {
  id: string;
  approvalReference: string;
  dataClassification: string;
  approvalScope: string;
  expiresAt: string;
}

// Authorize AI interpretation for one consultation by linking it to the
// newest active DEIDENTIFIED_EVALUATION release approval.
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

    const approvalsResponse = await apiFetch('/api/v2/video-interpretation/release-approvals/active');
    const approvalsBody = (await approvalsResponse.json().catch(() => null)) as {
      success?: boolean;
      approvals?: ActiveApproval[];
      error?: string;
    } | null;
    if (!approvalsResponse.ok || !approvalsBody?.approvals) {
      return Response.json(
        { success: false, error: approvalsBody?.error ?? 'Failed to load release approvals' },
        { status: approvalsResponse.status || 502 },
      );
    }

    const approval = approvalsBody.approvals.find(
      (item) => item.dataClassification === 'DEIDENTIFIED_EVALUATION' && item.approvalScope === 'RELEASE',
    ) ?? null;
    if (!approval) {
      return Response.json(
        { success: false, error: 'No active DEIDENTIFIED_EVALUATION release approval exists. Create one first.' },
        { status: 409 },
      );
    }

    const upstream = await apiFetch(
      `/api/v2/video-consultations/${body.consultationId}/interpretation/allowlist`,
      {
        method: 'POST',
        body: JSON.stringify({
          releaseApprovalId: approval.id,
          expiresAt: approval.expiresAt,
        }),
      },
    );
    const data = await upstream.json().catch(() => ({ error: 'invalid_response' }));
    return Response.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/video-consultations/interpretation/authorize failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
