/**
 * Session API — returns current user info; auto-refreshes token if expiring.
 *
 * GET /api/auth/session
 */

import { NextResponse } from 'next/server';
import { getSession, saveSession, clearSession } from '@/lib/session';
import { extractUserFromToken, refreshAccessToken } from '@/lib/keycloak-client';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.access_token) {
      return NextResponse.json({ user: null });
    }

    const now = Math.floor(Date.now() / 1000);

    // Auto-refresh if expiring within 5 minutes
    if (session.expires_at - now < 300 && session.refresh_token) {
      try {
        const newTokens = await refreshAccessToken(session.refresh_token);
        const updated = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || session.refresh_token,
          id_token: newTokens.id_token,
          expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
        };
        await saveSession(updated);

        const user = extractUserFromToken(updated.access_token);
        return NextResponse.json({ user, accessToken: updated.access_token, expiresAt: updated.expires_at });
      } catch {
        await clearSession();
        return NextResponse.json({ user: null });
      }
    }

    const user = extractUserFromToken(session.access_token);
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user,
      accessToken: session.access_token,
      expiresAt: session.expires_at,
    });
  } catch (error) {
    console.error('[Session API] Error:', error);
    return NextResponse.json({ user: null });
  }
}
