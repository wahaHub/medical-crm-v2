/**
 * Password login API (Resource Owner Password Credentials flow)
 *
 * POST /api/auth/login  { username, password }
 * → exchanges credentials with Keycloak → stores tokens in session cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/session';
import { passwordGrant, extractUserFromToken } from '@/lib/keycloak-client';

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

    // Store tokens in session cookie
    await saveSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
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
