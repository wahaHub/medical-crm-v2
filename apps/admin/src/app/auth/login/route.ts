import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import crypto from 'node:crypto';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export async function GET() {
  const { verifier, challenge } = generatePKCE();

  // Store code_verifier in session for callback to use
  const session = await getSession();
  session.code_verifier = verifier;
  await session.save();

  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    redirect_uri: `${process.env.ADMIN_ORIGIN}/auth/callback`,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return NextResponse.redirect(
    `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/auth?${params}`,
  );
}
