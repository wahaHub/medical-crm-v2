/**
 * Keycloak OIDC client utilities
 *
 * Password grant flow: login page POSTs credentials → this module exchanges
 * them for tokens via Keycloak's token endpoint.
 */

const KEYCLOAK_ISSUER = () => process.env.KEYCLOAK_ISSUER!;
const KEYCLOAK_CLIENT_ID = () => process.env.KEYCLOAK_CLIENT_ID!;
const KEYCLOAK_CLIENT_SECRET = () => process.env.KEYCLOAK_CLIENT_SECRET;

export interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
}

export interface KeycloakUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  roles: string[];
  hospital_id?: string;
}

/** Decode a JWT payload without verifying the signature. */
export function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

/** Extract roles from a Keycloak JWT payload (supports multiple formats). */
function extractRoles(payload: Record<string, unknown>): string[] {
  const mergedRoles = new Set<string>();

  // 1. Standard: realm_access.roles
  const realmAccess = payload.realm_access as { roles?: string[] } | undefined;
  for (const role of realmAccess?.roles ?? []) {
    mergedRoles.add(role);
  }

  // 2. Top-level roles array
  if (Array.isArray(payload.roles)) {
    for (const role of payload.roles) {
      if (typeof role === 'string' && role.length > 0) {
        mergedRoles.add(role);
      }
    }
  }

  // 3. Client roles: resource_access.<client>.roles
  const resourceAccess = payload.resource_access as Record<string, { roles?: string[] }> | undefined;
  if (resourceAccess) {
    for (const clientId of Object.keys(resourceAccess)) {
      const clientRoles = resourceAccess[clientId]?.roles;
      for (const role of clientRoles ?? []) {
        mergedRoles.add(role);
      }
    }
  }

  if (mergedRoles.size > 0) {
    return [...mergedRoles];
  }

  // 4. Fallback heuristics (temporary until Keycloak role mapper is fixed)
  const email = (payload.email as string) || (payload.preferred_username as string) || '';
  if (email.includes('admin')) return ['admin'];
  if (payload.hospital_id) return ['hospital'];
  if (email.includes('hospital')) return ['hospital'];
  if (email.includes('patient')) return ['patient'];

  console.warn('[Keycloak] No roles found in token');
  return [];
}

/** Extract user info from an access token JWT. */
export function extractUserFromToken(accessToken: string): KeycloakUser | null {
  const payload = decodeJWT(accessToken);
  if (!payload) return null;

  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    preferred_username: payload.preferred_username as string | undefined,
    roles: extractRoles(payload),
    hospital_id: payload.hospital_id as string | undefined,
  };
}

/**
 * Exchange username/password for tokens (Resource Owner Password Credentials grant).
 */
export async function passwordGrant(
  username: string,
  password: string,
): Promise<KeycloakTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: KEYCLOAK_CLIENT_ID(),
    username,
    password,
    scope: 'openid email profile',
  });

  const secret = KEYCLOAK_CLIENT_SECRET();
  if (secret) params.append('client_secret', secret);

  const res = await fetch(`${KEYCLOAK_ISSUER()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error_description: 'Unknown error' }));
    throw new Error(err.error_description || 'Authentication failed');
  }

  return res.json();
}

/** Refresh an access token using a refresh token. */
export async function refreshAccessToken(
  refreshTokenValue: string,
): Promise<KeycloakTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: KEYCLOAK_CLIENT_ID(),
    refresh_token: refreshTokenValue,
  });

  const secret = KEYCLOAK_CLIENT_SECRET();
  if (secret) params.append('client_secret', secret);

  const res = await fetch(`${KEYCLOAK_ISSUER()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) throw new Error('Failed to refresh token');
  return res.json();
}

/** Build a Keycloak end-session URL. */
export function getLogoutUrl(idToken: string, postLogoutRedirectUri: string): string {
  const params = new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
  return `${KEYCLOAK_ISSUER()}/protocol/openid-connect/logout?${params}`;
}
