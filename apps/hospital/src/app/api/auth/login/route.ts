/**
 * Password login API (Resource Owner Password Credentials flow)
 *
 * POST /api/auth/login  { username, password }
 * → exchanges credentials with Keycloak → stores tokens in session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { saveSession } from '@/lib/session';
import { passwordGrant, extractUserFromToken } from '@/lib/keycloak-client';

const HOSPITAL_COOKIE_NAME = 'medical-crm-hospital-session';
const ADMIN_COOKIE_NAME = 'medical-crm-admin-session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const fallbackDevSecret = 'dev-session-secret-for-admin-portal-32chars-minimum';
const adminSessionPassword =
  process.env.SESSION_SECRET ??
  (process.env.NODE_ENV !== 'production' ? fallbackDevSecret : undefined);

if (!adminSessionPassword) {
  throw new Error('SESSION_SECRET is required in production');
}

interface AdminSessionData {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at?: number;
  code_verifier?: string;
}

function getTokenLength(token: string | undefined): number {
  return token?.length ?? 0;
}

function buildAdminSessionDebugInfo(
  session: AdminSessionData,
  nextData: Partial<AdminSessionData>,
) {
  return {
    existingSession: {
      hasAccessToken: Boolean(session.access_token),
      accessTokenLength: getTokenLength(session.access_token),
      refreshTokenLength: getTokenLength(session.refresh_token),
      idTokenLength: getTokenLength(session.id_token),
      hasCodeVerifier: Boolean(session.code_verifier),
      codeVerifierLength: getTokenLength(session.code_verifier),
    },
    nextWrite: {
      accessTokenLength: getTokenLength(nextData.access_token),
      refreshTokenLength: getTokenLength(nextData.refresh_token),
      idTokenLength: getTokenLength(nextData.id_token),
      expiresAt: nextData.expires_at ?? null,
    },
    note: 'Admin session intentionally omits id_token to stay under browser cookie limits.',
  };
}

const adminSessionOptions: SessionOptions = {
  password: adminSessionPassword,
  cookieName: ADMIN_COOKIE_NAME,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
  },
};

async function saveAdminSession(data: Partial<AdminSessionData>): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSessionData>(cookieStore, adminSessionOptions);
  const debugInfo = buildAdminSessionDebugInfo(session, data);
  if (data.access_token !== undefined) session.access_token = data.access_token;
  if (data.refresh_token !== undefined) session.refresh_token = data.refresh_token;
  if (data.expires_at !== undefined) session.expires_at = data.expires_at;
  session.id_token = undefined;
  session.code_verifier = undefined;

  try {
    await session.save();
  } catch (error) {
    console.error('[Login API] Failed to save admin session', debugInfo, error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 },
      );
    }

    // Exchange credentials for Keycloak tokens
    let tokens;
    try {
      tokens = await passwordGrant(username, password);
    } catch (err) {
      return NextResponse.json(
        {
          error: 'Invalid credentials',
          details: err instanceof Error ? err.message : 'Authentication failed',
        },
        { status: 401 },
      );
    }

    // Extract user info from JWT
    const user = extractUserFromToken(tokens.access_token);
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to extract user information from token' },
        { status: 500 },
      );
    }

    const roles = (user.roles ?? []).map((role) => role.toLowerCase());
    const isAdmin = roles.includes('admin');
    const isHospitalUser =
      roles.includes('hospital') || roles.includes('regular_hospital');
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    if (isAdmin) {
      await saveAdminSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
      });

      const response = NextResponse.json({
        success: true,
        user: { email: user.email, roles: user.roles },
        redirectTo: process.env.ADMIN_ORIGIN ?? 'http://localhost:3002',
      });
      response.cookies.set(HOSPITAL_COOKIE_NAME, '', { maxAge: 0, path: '/' });
      return response;
    }

    if (!isHospitalUser) {
      return NextResponse.json(
        {
          error: 'This account is not authorized for Medical CRM',
        },
        { status: 403 },
      );
    }

    // Store tokens in session cookie
    await saveSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      expires_at: expiresAt,
    });

    return NextResponse.json({
      success: true,
      user: { email: user.email, roles: user.roles },
      redirectTo: '/',
    });
  } catch (error) {
    console.error('[Login API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
