import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as jose from 'jose';
import { eq } from 'drizzle-orm';
import { getServerEnv } from '@medical-crm/config';
import { getCrmDb } from '../database/crm-client.js';
import { users } from '../database/schema/index.js';

let jwks: jose.JWTVerifyGetKey;

function getJWKS() {
  if (!jwks) {
    const env = getServerEnv();
    jwks = jose.createRemoteJWKSet(
      new URL(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`)
    );
  }
  return jwks;
}

export type Session = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

type CrmIdentity = {
  id: string;
  hospitalId: string | null;
};

async function findCrmIdentityByKeycloakUserId(
  keycloakUserId: string,
): Promise<CrmIdentity | null> {
  const rows = await getCrmDb()
    .select({
      id: users.id,
      hospitalId: users.hospitalId,
      keycloakUserId: users.keycloakUserId,
    })
    .from(users)
    .where(eq(users.keycloakUserId, keycloakUserId))
    .limit(1);

  return rows[0] ?? null;
}
export const authMiddleware = createMiddleware<{ Variables: { session: Session } }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const env = getServerEnv();

    try {
      // NOTE: Keycloak access tokens use aud='account' by default, not the client ID.
      // We verify the issuer and check azp (authorized party) instead of aud.
      const { payload } = await jose.jwtVerify(token, getJWKS(), {
        issuer: env.KEYCLOAK_ISSUER,
      });

      // Verify the token was issued for our client
      if (payload.azp !== env.KEYCLOAK_CLIENT_ID) {
        throw new Error(`Token azp '${payload.azp}' does not match client '${env.KEYCLOAK_CLIENT_ID}'`);
      }

      const keycloakUserId = payload.sub;
      const email = payload.email as string | undefined;
      if (!keycloakUserId || !email) {
        throw new Error('Token missing required identity claims');
      }

      const crmIdentity = await findCrmIdentityByKeycloakUserId(keycloakUserId);
      if (!crmIdentity) {
        throw new Error(`No CRM user found for keycloak user ${keycloakUserId}`);
      }

      c.set('session', {
        userId: crmIdentity.id,
        email,
        roles: (payload.realm_access as { roles?: string[] })?.roles ?? [],
        hospitalId:
          crmIdentity.hospitalId
          ?? (payload as Record<string, unknown>).hospital_id as string
          ?? null,
      });
    } catch (err) {
      console.error('[Auth] JWT verification failed:', err instanceof Error ? err.message : err);
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    await next();
  }
);

export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const session = c.get('session') as Session;
    if (!roles.some((r) => session.roles.includes(r))) {
      throw new HTTPException(403, { message: 'Insufficient permissions' });
    }
    await next();
  });

export const requireHospital = createMiddleware(async (c, next) => {
  const session = c.get('session') as Session;
  if (!session.hospitalId) {
    throw new HTTPException(403, { message: 'No hospital association' });
  }
  await next();
});
