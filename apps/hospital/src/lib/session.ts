/**
 * Session management — plain JSON httpOnly cookie (matches v1 approach).
 *
 * iron-session encryption makes the cookie too large for Keycloak JWTs,
 * so we use a plain JSON cookie with httpOnly + secure flags instead.
 */

import { cookies } from 'next/headers';

const COOKIE_NAME = 'medical-crm-hospital-session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export interface SessionData {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_at: number;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function saveSession(data: SessionData): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
