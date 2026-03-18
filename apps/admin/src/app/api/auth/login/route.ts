import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/session';
import { extractUserFromToken, passwordGrant } from '@/lib/keycloak-client';

const HOSPITAL_COOKIE_NAME = 'medical-crm-hospital-session';
const ADMIN_COOKIE_NAME = 'medical-crm-admin-session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function lowerRoles(roles: string[] | undefined): string[] {
  return (roles ?? []).map((role) => role.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = (await request.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 },
      );
    }

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

    const user = extractUserFromToken(tokens.access_token);
    if (!user) {
      return NextResponse.json(
        { error: 'Failed to extract user information from token' },
        { status: 500 },
      );
    }

    const roles = lowerRoles(user.roles);
    const isAdmin = roles.includes('admin');
    const isHospitalUser = roles.includes('hospital') || roles.includes('regular_hospital');

    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    if (isAdmin) {
      await saveSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
      });

      const response = NextResponse.json({
        success: true,
        user: { email: user.email, roles: user.roles },
        redirectTo: '/',
      });
      response.cookies.set(HOSPITAL_COOKIE_NAME, '', { maxAge: 0, path: '/' });
      return response;
    }

    if (isHospitalUser) {
      const hospitalOrigin = process.env.HOSPITAL_ORIGIN ?? 'http://localhost:3003';
      const response = NextResponse.json({
        success: true,
        user: { email: user.email, roles: user.roles },
        redirectTo: hospitalOrigin,
      });

      response.cookies.set(
        HOSPITAL_COOKIE_NAME,
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          id_token: tokens.id_token,
          expires_at: expiresAt,
        }),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: MAX_AGE,
          path: '/',
        },
      );
      response.cookies.set(ADMIN_COOKIE_NAME, '', { maxAge: 0, path: '/' });
      return response;
    }

    return NextResponse.json(
      {
        error: 'This account is not authorized for any portal',
      },
      { status: 403 },
    );
  } catch (error) {
    console.error('[Admin Login API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
