import { redirect } from 'next/navigation';
import { getSession } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiClient(path: string, init?: RequestInit) {
  const session = await getSession();

  if (!session.access_token) {
    redirect('/auth/login');
  }

  // Check token expiry — refresh if within 60s
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    const refreshed = await refreshToken(session.refresh_token);
    if (!refreshed) {
      session.destroy();
      redirect('/auth/login');
    }
    session.access_token = refreshed.access_token;
    session.refresh_token = refreshed.refresh_token;
    session.expires_at = refreshed.expires_at;
    await session.save();
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
    const data = await res.json();
    return {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in as number),
    };
  } catch {
    return null;
  }
}
