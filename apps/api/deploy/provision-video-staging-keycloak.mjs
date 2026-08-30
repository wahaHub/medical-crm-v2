import { chmod, chown, readFile, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { URL, URLSearchParams } from 'node:url';

const realm = 'medora-video-staging';
const clientId = 'medora-video-staging-api';
const username = 'video-staging-admin';
const email = 'video-staging-admin@invalid.example';
const productionIssuer = new URL(process.env.KEYCLOAK_ISSUER);
const realmMarker = '/realms/';
const markerIndex = productionIssuer.pathname.indexOf(realmMarker);
if (markerIndex < 0) throw new Error('KEYCLOAK_ISSUER has no /realms/ segment');
productionIssuer.pathname = productionIssuer.pathname.slice(0, markerIndex);
productionIssuer.search = '';
productionIssuer.hash = '';
const baseUrl = productionIssuer.toString().replace(/\/$/, '');

async function request(url, options = {}, accepted = [200]) {
  const response = await globalThis.fetch(url, options);
  if (!accepted.includes(response.status)) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`${options.method ?? 'GET'} ${url} returned ${response.status}: ${body}`);
  }
  return response;
}

const tokenResponse = await request(
  `${baseUrl}/realms/master/protocol/openid-connect/token`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: process.env.KEYCLOAK_ADMIN_USERNAME,
      password: process.env.KEYCLOAK_ADMIN_PASSWORD,
    }),
  },
);
const { access_token: adminToken } = await tokenResponse.json();
if (!adminToken) throw new Error('Keycloak admin token response omitted access_token');
const adminHeaders = {
  authorization: `Bearer ${adminToken}`,
  'content-type': 'application/json',
};

await request(`${baseUrl}/admin/realms`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ realm, enabled: true, registrationAllowed: false }),
}, [201, 409]);

await request(`${baseUrl}/admin/realms/${realm}/roles`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ name: 'admin', description: 'De-identified video staging operator' }),
}, [201, 409]);

const clientUrl = `${baseUrl}/admin/realms/${realm}/clients`;
let clients = await (await request(
  `${clientUrl}?clientId=${encodeURIComponent(clientId)}`,
  { headers: adminHeaders },
)).json();
const clientConfig = {
  clientId,
  enabled: true,
  protocol: 'openid-connect',
  publicClient: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: true,
  serviceAccountsEnabled: false,
  fullScopeAllowed: true,
  redirectUris: [],
  webOrigins: [],
  defaultClientScopes: ['profile', 'email', 'roles', 'web-origins', 'acr'],
};
if (clients.length === 0) {
  await request(clientUrl, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(clientConfig),
  }, [201]);
  clients = await (await request(
    `${clientUrl}?clientId=${encodeURIComponent(clientId)}`,
    { headers: adminHeaders },
  )).json();
}
if (clients.length !== 1) throw new Error('Expected exactly one staging client');
const clientUuid = clients[0].id;
await request(`${clientUrl}/${clientUuid}`, {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ ...clients[0], ...clientConfig }),
}, [204]);

await request(`${clientUrl}/${clientUuid}/protocol-mappers/models`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({
    name: 'video-staging-subject',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-sub-mapper',
    config: {
      'access.token.claim': 'true',
      'lightweight.claim': 'true',
      'introspection.token.claim': 'true',
    },
  }),
}, [201, 409]);

const credentialPath = '/etc/medora/staging/video-staging-operator.env';
let password;
try {
  const existing = await readFile(credentialPath, 'utf8');
  password = existing.match(/^VIDEO_STAGING_PASSWORD=(.+)$/m)?.[1];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
password ||= randomBytes(32).toString('base64url');

const usersUrl = `${baseUrl}/admin/realms/${realm}/users`;
let users = await (await request(
  `${usersUrl}?username=${encodeURIComponent(username)}&exact=true`,
  { headers: adminHeaders },
)).json();
if (users.length === 0) {
  await request(usersUrl, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ username, email, emailVerified: true, enabled: true }),
  }, [201]);
  users = await (await request(
    `${usersUrl}?username=${encodeURIComponent(username)}&exact=true`,
    { headers: adminHeaders },
  )).json();
}
if (users.length !== 1) throw new Error('Expected exactly one staging operator');
const userId = users[0].id;
await request(`${usersUrl}/${userId}`, {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({
    ...users[0],
    username,
    email,
    firstName: 'Video',
    lastName: 'Staging',
    emailVerified: true,
    enabled: true,
    requiredActions: [],
  }),
}, [204]);
await request(`${usersUrl}/${userId}/reset-password`, {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ type: 'password', value: password, temporary: false }),
}, [204]);
const adminRole = await (await request(
  `${baseUrl}/admin/realms/${realm}/roles/admin`,
  { headers: adminHeaders },
)).json();
await request(`${usersUrl}/${userId}/role-mappings/realm`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify([adminRole]),
}, [204]);

const issuer = `${baseUrl}/realms/${realm}`;
await writeFile(
  credentialPath,
  `KEYCLOAK_ISSUER=${issuer}\nKEYCLOAK_CLIENT_ID=${clientId}\nVIDEO_STAGING_USERNAME=${username}\nVIDEO_STAGING_PASSWORD=${password}\n`,
  { mode: 0o600 },
);
await chmod(credentialPath, 0o600);
await chown(credentialPath, 0, 0);

const stagingEnvPath = '/opt/medora/medora-crm-v2-api-staging/.env';
const stagingEnvOwner = await stat(stagingEnvPath);
let stagingEnv = await readFile(stagingEnvPath, 'utf8');
const updates = {
  KEYCLOAK_ISSUER: issuer,
  KEYCLOAK_CLIENT_ID: clientId,
  KEYCLOAK_CLIENT_SECRET: 'unused-public-staging-client',
  KEYCLOAK_BASE_URL: baseUrl,
  KEYCLOAK_REALM: realm,
};
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  stagingEnv = pattern.test(stagingEnv)
    ? stagingEnv.replace(pattern, line)
    : `${stagingEnv.replace(/\n?$/, '\n')}${line}\n`;
}
await writeFile(stagingEnvPath, stagingEnv, { mode: 0o600 });
await chmod(stagingEnvPath, 0o600);
await chown(stagingEnvPath, stagingEnvOwner.uid, stagingEnvOwner.gid);

globalThis.console.log(JSON.stringify({ realm, clientId, username, configured: true }));
