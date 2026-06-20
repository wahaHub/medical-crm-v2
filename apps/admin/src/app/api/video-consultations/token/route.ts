import { type NextRequest } from 'next/server';
import { requireAdminSession } from '@/lib/supabase-main';
import { createLiveKitToken } from '@/lib/livekit-token';

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => ({}))) as {
      roomName?: string;
      identity?: string;
      displayName?: string;
    };

    if (!body.roomName || !body.identity) {
      return Response.json(
        { success: false, error: 'roomName and identity are required' },
        { status: 400 },
      );
    }

    const result = createLiveKitToken({
      roomName: body.roomName,
      identity: body.identity,
      displayName: body.displayName,
    });

    return Response.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'unauthorized') {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/video-consultations/token failed:', err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
