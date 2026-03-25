import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at?: number;
  /** PKCE code_verifier — stored during login, consumed during callback */
  code_verifier?: string;
}

const fallbackDevSecret = 'dev-session-secret-for-admin-portal-32chars-minimum';
const sessionPassword =
  process.env.SESSION_SECRET ??
  (process.env.NODE_ENV !== 'production' ? fallbackDevSecret : undefined);

if (!sessionPassword) {
  throw new Error('SESSION_SECRET is required in production');
}

const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: 'medical-crm-admin-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function saveSession(data: Partial<SessionData>): Promise<void> {
  const session = await getSession();
  if (data.access_token !== undefined) session.access_token = data.access_token;
  if (data.refresh_token !== undefined) session.refresh_token = data.refresh_token;
  if (data.id_token !== undefined) {
    session.id_token = data.id_token;
  } else {
    session.id_token = undefined;
  }
  if (data.expires_at !== undefined) session.expires_at = data.expires_at;
  session.code_verifier = undefined;
  await session.save();
}

export async function clearSession() {
  const session = await getSession();
  session.destroy();
}
