import { type NextRequest } from 'next/server';
import { requireAdminSession } from '@/lib/supabase-main';

interface Participant {
  identity: string;
  language: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();

    const body = (await request.json().catch(() => ({}))) as {
      roomName?: string;
      participants?: Participant[];
    };

    if (!body.roomName || !Array.isArray(body.participants) || body.participants.length < 2) {
      return Response.json(
        { success: false, error: 'roomName and at least 2 participants are required' },
        { status: 400 },
      );
    }

    for (const p of body.participants) {
      if (!p.identity || !p.language) {
        return Response.json(
          { success: false, error: 'Each participant must have identity and language' },
          { status: 400 },
        );
      }
    }

    const botUrl = process.env.INTERPRETATION_BOT_URL;
    const botApiKey = process.env.INTERPRETATION_BOT_API_KEY;

    if (!botUrl || !botApiKey) {
      console.error('Interpretation bot is not configured');
      return Response.json(
        { success: false, error: 'interpretation_bot_not_configured' },
        { status: 503 },
      );
    }

    const res = await fetch(`${botUrl}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botApiKey}`,
      },
      body: JSON.stringify({
        room_name: body.roomName,
        participants: body.participants,
      }),
    });

    const data = (await res.json().catch(() => ({ error: 'invalid_response' }))) as Record<
      string,
      unknown
    >;

    if (!res.ok) {
      console.error('Interpretation bot /start failed:', data);
      return Response.json(
        { success: false, error: data.error || 'bot_start_failed' },
        { status: res.status },
      );
    }

    return Response.json({ success: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'unauthorized') {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/video-consultations/interpretation/start failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
