import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  const idToken = session.id_token;
  await clearSession();

  // Redirect to Keycloak end-session endpoint with id_token_hint for single sign-out
  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    post_logout_redirect_uri: process.env.HOSPITAL_ORIGIN!,
    ...(idToken ? { id_token_hint: idToken } : {}),
  });

  return NextResponse.redirect(
    `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params}`,
  );
}
