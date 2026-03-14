import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Retrieve PKCE code_verifier from session
  const session = await getSession();
  const codeVerifier = session.code_verifier;
  if (!codeVerifier) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Exchange authorization code for tokens (PKCE: include code_verifier)
  const tokenRes = await fetch(
    `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${process.env.ADMIN_ORIGIN}/auth/callback`,
      }),
    },
  );

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const data = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_in: number;
  };
  session.access_token = data.access_token;
  session.refresh_token = data.refresh_token;
  session.id_token = data.id_token;
  session.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
  delete session.code_verifier; // consumed
  await session.save();

  return NextResponse.redirect(new URL('/', request.url));
}
