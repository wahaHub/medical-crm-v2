import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL, URLSearchParams } from 'node:url';

const consultationId = process.env.VIDEO_STAGING_E2E_CONSULTATION_ID;
const issuer = process.env.KEYCLOAK_ISSUER;
const clientId = process.env.KEYCLOAK_CLIENT_ID;
const username = process.env.VIDEO_STAGING_USERNAME;
const password = process.env.VIDEO_STAGING_PASSWORD;
if (!consultationId || !issuer || !clientId || !username || !password) {
  throw new Error('The staging E2E gate smoke environment is incomplete');
}

const tokenResponse = await globalThis.fetch(`${issuer}/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    grant_type: 'password',
    username,
    password,
    scope: 'openid email profile',
  }),
});
const tokenBody = await tokenResponse.json().catch(() => ({}));
if (!tokenResponse.ok || !tokenBody.access_token) throw new Error('Staging operator login failed');
const payload = JSON.parse(
  Buffer.from(tokenBody.access_token.split('.')[1], 'base64url').toString('utf8'),
);
if (payload.azp !== clientId || !payload.realm_access?.roles?.includes('admin')) {
  throw new Error('Staging operator claims are invalid');
}

const apiBaseUrl = new URL(process.env.VIDEO_STAGING_API_URL ?? 'http://127.0.0.1:3002');
const headers = {
  authorization: `Bearer ${tokenBody.access_token}`,
  'content-type': 'application/json',
};

const readinessResponse = await globalThis.fetch(new URL(
  `/api/v2/video-consultations/${consultationId}/interpretation/readiness`,
  apiBaseUrl,
), { headers });
const readiness = await readinessResponse.json().catch(() => ({}));
if (!readinessResponse.ok
  || readiness.mediaCodeGate !== true
  || readiness.deidentifiedE2eMode !== true
  || readiness.deidentifiedE2eMaximumDurationSeconds !== 300
  || readiness.deidentifiedE2eMaximumActiveRooms !== 1
  || readiness.realPatientCodeGate !== false
  || readiness.approval?.dataClassification !== 'DEIDENTIFIED_EVALUATION'
  || readiness.approval?.approvalScope !== 'SYNTHETIC_E2E'
  || readiness.approval?.privacyVerified !== false
  || readiness.approval?.observabilityDisabled !== false
  || readiness.approval?.retentionVerified !== false) {
  throw new Error('Staging E2E readiness gates are invalid');
}

const realPatientResponse = await globalThis.fetch(new URL(
  `/api/v2/video-consultations/${consultationId}/interpretation/start`,
  apiBaseUrl,
), {
  method: 'POST',
  headers,
  body: JSON.stringify({
    sourceLanguage: 'zh',
    maximumAiDurationSeconds: 60,
    dataClassification: 'REAL_PATIENT',
  }),
});
const realPatientBody = await realPatientResponse.json().catch(() => ({}));
if (realPatientResponse.status !== 503
  || (realPatientBody.message ?? realPatientBody.error)
    !== 'REAL_PATIENT_INTERPRETATION_NOT_RELEASED') {
  throw new Error('REAL_PATIENT hard gate did not fail closed');
}

const durationResponse = await globalThis.fetch(new URL(
  `/api/v2/video-consultations/${consultationId}/interpretation/start`,
  apiBaseUrl,
), {
  method: 'POST',
  headers,
  body: JSON.stringify({
    sourceLanguage: 'zh',
    maximumAiDurationSeconds: 301,
    dataClassification: 'DEIDENTIFIED_EVALUATION',
  }),
});
const durationBody = await durationResponse.json().catch(() => ({}));
if (durationResponse.status !== 400
  || (durationBody.message ?? durationBody.error)
    !== 'DEIDENTIFIED_E2E_DURATION_EXCEEDS_LIMIT') {
  throw new Error('De-identified E2E duration gate did not fail closed');
}

globalThis.console.log(JSON.stringify({
  readiness: 'qualified',
  realPatientGate: 'closed',
  deidentifiedMaximumAiDurationSeconds: 300,
  maximumActiveAiRooms: 1,
}));
