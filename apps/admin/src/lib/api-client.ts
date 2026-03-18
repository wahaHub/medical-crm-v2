import { redirect } from 'next/navigation';
import { clearSession, getSession, saveSession } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiClient(path: string, init?: RequestInit) {
  const session = await getSession();

  if (!session.access_token) {
    redirect('/auth/login');
  }

  // Check token expiry — refresh if within 60s
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    if (!session.refresh_token) {
      await clearSession();
      redirect('/auth/login');
    }
    const refreshed = await refreshToken(session.refresh_token);
    if (!refreshed) {
      await clearSession();
      redirect('/auth/login');
    }
    await saveSession({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
    });
    session.access_token = refreshed.access_token;
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

async function refreshToken(refreshToken: string) {
  try {
    const res = await fetch(
      `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
          refresh_token: refreshToken,
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch {
    return null;
  }
}
