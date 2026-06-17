import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { getCrmDb } from '../database/crm-client.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const ENV_CANDIDATES = [
  resolve(REPO_ROOT, 'apps/api/.env'),
  resolve(REPO_ROOT, '.env'),
];

interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
}

interface KeycloakRole {
  id: string;
  name: string;
}

function loadRuntimeEnv(): void {
  if (typeof process.loadEnvFile !== 'function') return;
  for (const envPath of ENV_CANDIDATES) {
    if (existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function keycloakJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Keycloak request failed: ${res.status} ${await res.text()}`);
  }
  return await res.json() as T;
}

async function getAdminToken(baseUrl: string, username: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username,
    password,
  });
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Failed to get Keycloak admin token: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function findKeycloakUser(baseUrl: string, realm: string, token: string, email: string): Promise<KeycloakUser | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const byEmail = new URLSearchParams({ email, exact: 'true' });
  const emailMatches = await keycloakJson<KeycloakUser[]>(
    `${baseUrl}/admin/realms/${realm}/users?${byEmail}`,
    { headers },
  );
  if (emailMatches.length > 0) return emailMatches[0]!;

  const byUsername = new URLSearchParams({ username: email, exact: 'true' });
  const usernameMatches = await keycloakJson<KeycloakUser[]>(
    `${baseUrl}/admin/realms/${realm}/users?${byUsername}`,
    { headers },
  );
  return usernameMatches[0] ?? null;
}

async function ensureKeycloakUser(baseUrl: string, realm: string, token: string, email: string): Promise<string> {
  const existing = await findKeycloakUser(baseUrl, realm, token, email);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (existing) {
    const res = await fetch(`${baseUrl}/admin/realms/${realm}/users/${existing.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        username: email,
        email,
        enabled: true,
        emailVerified: true,
        requiredActions: [],
      }),
    });
    if (!res.ok) throw new Error(`Failed to update Keycloak user: ${res.status} ${await res.text()}`);
    return existing.id;
  }

  const createRes = await fetch(`${baseUrl}/admin/realms/${realm}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username: email,
      email,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
    }),
  });
  if (!createRes.ok) throw new Error(`Failed to create Keycloak user: ${createRes.status} ${await createRes.text()}`);

  const location = createRes.headers.get('Location');
  const id = location?.split('/').pop();
  if (!id) throw new Error('Keycloak did not return a created user id');
  return id;
}

async function setKeycloakPassword(baseUrl: string, realm: string, token: string, userId: string, password: string): Promise<void> {
  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}/reset-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: 'password', value: password, temporary: false }),
  });
  if (!res.ok) throw new Error(`Failed to set Keycloak password: ${res.status} ${await res.text()}`);
}

async function assignRealmRole(baseUrl: string, realm: string, token: string, userId: string, roleName: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const role = await keycloakJson<KeycloakRole>(
    `${baseUrl}/admin/realms/${realm}/roles/${encodeURIComponent(roleName)}`,
    { headers },
  );
  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify([role]),
  });
  if (!res.ok) throw new Error(`Failed to assign Keycloak role ${roleName}: ${res.status} ${await res.text()}`);
}

async function upsertCrmAdmin(databaseUrl: string, email: string, keycloakUserId: string): Promise<{ id: string; email: string; role: string }> {
  process.env.DATABASE_URL = databaseUrl;
  const db = getCrmDb();
  const result = await db.execute(sql`
      insert into users (
        email,
        name,
        role,
        patient_site,
        hospital_id,
        status,
        keycloak_user_id,
        preferred_language,
        created_at,
        updated_at
      )
      values (
        ${email},
        ${email},
        'ADMIN',
        null,
        null,
        'active',
        ${keycloakUserId},
        'zh',
        now(),
        now()
      )
      on conflict (email) where (role <> 'PATIENT')
      do update set
        name = excluded.name,
        role = 'ADMIN',
        patient_site = null,
        hospital_id = null,
        status = 'active',
        keycloak_user_id = excluded.keycloak_user_id,
        updated_at = now()
      returning id::text, email, role::text
    `);
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  return rows[0] as { id: string; email: string; role: string };
}

async function main(): Promise<void> {
  loadRuntimeEnv();

  const email = (argValue('email') ?? process.env['ADMIN_EMAIL'] ?? 'contact@medorabeauty.com').trim().toLowerCase();
  const password = process.env['ADMIN_PASSWORD'] ?? process.env['PROVISION_ADMIN_PASSWORD'];
  if (!password) throw new Error('ADMIN_PASSWORD is required');

  const keycloakBaseUrl = requiredEnv('KEYCLOAK_BASE_URL').replace(/\/+$/, '');
  const realm = requiredEnv('KEYCLOAK_REALM');
  const adminUsername = requiredEnv('KEYCLOAK_ADMIN_USERNAME');
  const adminPassword = requiredEnv('KEYCLOAK_ADMIN_PASSWORD');
  const databaseUrl = requiredEnv('DATABASE_URL');
  const roleName = process.env['ADMIN_KEYCLOAK_ROLE']?.trim() || 'admin';

  const token = await getAdminToken(keycloakBaseUrl, adminUsername, adminPassword);
  const keycloakUserId = await ensureKeycloakUser(keycloakBaseUrl, realm, token, email);
  await setKeycloakPassword(keycloakBaseUrl, realm, token, keycloakUserId, password);
  await assignRealmRole(keycloakBaseUrl, realm, token, keycloakUserId, roleName);
  const crmUser = await upsertCrmAdmin(databaseUrl, email, keycloakUserId);

  console.log(JSON.stringify({
    ok: true,
    email,
    keycloakUserId,
    crmUser,
    roleName,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
