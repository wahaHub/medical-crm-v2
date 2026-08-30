import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL, URLSearchParams } from 'node:url';

const issuer = process.env.KEYCLOAK_ISSUER;
const clientId = process.env.KEYCLOAK_CLIENT_ID;
const username = process.env.VIDEO_STAGING_USERNAME;
const password = process.env.VIDEO_STAGING_PASSWORD;
if (!issuer || !clientId || !username || !password) {
  throw new Error('The root-only staging operator environment is incomplete');
}

const tokenResponse = await globalThis.fetch(
  `${issuer}/protocol/openid-connect/token`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'password',
      username,
      password,
      scope: 'openid email profile',
    }),
  },
);
if (!tokenResponse.ok) {
  const failure = await tokenResponse.json().catch(() => ({}));
  throw new Error(
    `Staging token request returned ${tokenResponse.status}: ${failure.error ?? 'unknown'}`,
  );
}
const { access_token: token } = await tokenResponse.json();
if (!token) throw new Error('Staging token response omitted access_token');
const payload = JSON.parse(
  Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
);
if (payload.azp !== clientId || !payload.sub) {
  throw new Error('Staging token subject/client claims are invalid');
}
if (payload.email !== 'video-staging-admin@invalid.example') {
  throw new Error('Staging token email is invalid');
}
if (!payload.realm_access?.roles?.includes('admin')) {
  throw new Error('Staging token omitted the admin role');
}

const apiBaseUrl = new URL(
  process.env.VIDEO_STAGING_API_URL
    ?? 'https://staging-crmapi.medicaltourismchina.health',
);
const smokePath =
  '/api/v2/video-consultations/11111111-1111-4111-8111-111111111111/interpretation';
const response = await globalThis.fetch(new URL(smokePath, apiBaseUrl), {
  headers: { authorization: `Bearer ${token}` },
});
const body = await response.json().catch(() => ({}));
if (response.status !== 200 || body.success !== true || body.job !== null) {
  throw new Error(
    `Authenticated video smoke failed with ${response.status}: ${body.error ?? 'unexpected response'}`,
  );
}

globalThis.console.log(JSON.stringify({
  tokenClaims: 'valid',
  apiStatus: response.status,
  job: body.job,
}));
