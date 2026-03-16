// apps/hospital/src/lib/api-fetch.ts
import { getSession, saveSession, clearSession } from './session';
import { refreshAccessToken } from './keycloak-client';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const session = await getSession();

  if (!session?.access_token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auto-refresh if expiring within 60 seconds
  let accessToken = session.access_token;
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    try {
      const newTokens = await refreshAccessToken(session.refresh_token);
      accessToken = newTokens.access_token;
      await saveSession({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || session.refresh_token,
        id_token: newTokens.id_token,
        expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
      });
    } catch {
      await clearSession();
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
