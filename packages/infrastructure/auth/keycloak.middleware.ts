import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as jose from 'jose';
import { eq } from 'drizzle-orm';
import { getServerEnv } from '@medical-crm/config';
import { getCrmDb } from '../database/crm-client.js';
import { users } from '../database/schema/index.js';
import { isTransientDatabaseError, withTransientDatabaseRetry } from '../database/transient-db-retry.js';

let jwks: jose.JWTVerifyGetKey;
const AUTH_IDENTITY_CACHE_TTL_MS = 60_000;
const LAST_LOGIN_TOUCH_INTERVAL_MS = 5 * 60_000;
const crmIdentityCache = new Map<string, { identity: CrmIdentity; expiresAt: number }>();
const crmIdentityLookupInflight = new Map<string, Promise<CrmIdentity | null>>();
const lastLoginTouchCache = new Map<string, number>();

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

async function touchLastLogin(userId: string): Promise<void> {
  const nowMs = Date.now();
  const lastTouchedAt = lastLoginTouchCache.get(userId);
  if (lastTouchedAt && nowMs - lastTouchedAt < LAST_LOGIN_TOUCH_INTERVAL_MS) {
    return;
  }

  const db = getCrmDb() as ReturnType<typeof getCrmDb> & {
    update?: ReturnType<typeof getCrmDb>['update'];
  };
  if (typeof db.update !== 'function') {
    return;
  }

  const now = new Date().toISOString();
  try {
    await db
      .update(users)
      .set({
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    lastLoginTouchCache.set(userId, nowMs);
  } catch (error) {
    console.warn('[Auth] Failed to update last_login_at:', error);
  }
}

async function findCrmIdentityByKeycloakUserId(
  keycloakUserId: string,
): Promise<CrmIdentity | null> {
  const cached = crmIdentityCache.get(keycloakUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.identity;
  }
  if (cached) {
    crmIdentityCache.delete(keycloakUserId);
  }

  const inflightLookup = crmIdentityLookupInflight.get(keycloakUserId);
  if (inflightLookup) {
    return inflightLookup;
  }

  const lookupPromise = (async () => {
    const rows = await getCrmDb()
      .select({
        id: users.id,
        hospitalId: users.hospitalId,
        keycloakUserId: users.keycloakUserId,
      })
      .from(users)
      .where(eq(users.keycloakUserId, keycloakUserId))
      .limit(1);

    const identity = rows[0] ?? null;
    if (identity) {
      crmIdentityCache.set(keycloakUserId, {
        identity,
        expiresAt: Date.now() + AUTH_IDENTITY_CACHE_TTL_MS,
      });
    }

    return identity;
  })();

  crmIdentityLookupInflight.set(keycloakUserId, lookupPromise);

  try {
    return await lookupPromise;
  } finally {
    crmIdentityLookupInflight.delete(keycloakUserId);
  }
}
export const authMiddleware = createMiddleware<{ Variables: { session: Session } }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const env = getServerEnv();
    let payload: jose.JWTPayload;

    try {
      // NOTE: Keycloak access tokens use aud='account' by default, not the client ID.
      // We verify the issuer and check azp (authorized party) instead of aud.
      const verified = await jose.jwtVerify(token, getJWKS(), {
        issuer: env.KEYCLOAK_ISSUER,
      });
      payload = verified.payload;

      // Verify the token was issued for our client
      if (payload.azp !== env.KEYCLOAK_CLIENT_ID) {
        throw new Error(`Token azp '${payload.azp}' does not match client '${env.KEYCLOAK_CLIENT_ID}'`);
      }
    } catch (err) {
      console.error('[Auth] JWT verification failed:', err instanceof Error ? err.message : err);
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    const keycloakUserId = payload.sub;
    const email = payload.email as string | undefined;
    if (!keycloakUserId || !email) {
      console.error('[Auth] Token missing required identity claims');
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    let crmIdentity: CrmIdentity | null;
    try {
      crmIdentity = await withTransientDatabaseRetry(
        'auth identity lookup',
        () => findCrmIdentityByKeycloakUserId(keycloakUserId),
      );
    } catch (err) {
      console.error('[Auth] CRM identity lookup failed:', err instanceof Error ? err.message : err);
      if (isTransientDatabaseError(err)) {
        throw new HTTPException(503, { message: 'Authentication service temporarily unavailable' });
      }
      throw err;
    }

    if (!crmIdentity) {
      console.warn(`[Auth] No CRM user found for keycloak user ${keycloakUserId}`);
      throw new HTTPException(401, { message: 'Unauthorized' });
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
    const roles = (payload.realm_access as { roles?: string[] })?.roles ?? [];
    if (roles.includes('admin') || roles.includes('hospital')) {
      void touchLastLogin(crmIdentity.id);
    }

    return await next();
  }
);

export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const session = c.get('session') as Session;
    if (!roles.some((r) => session.roles.includes(r))) {
      throw new HTTPException(403, { message: 'Insufficient permissions' });
    }
    return await next();
  });

export const requireHospital = createMiddleware(async (c, next) => {
  const session = c.get('session') as Session;
  if (!session.hospitalId) {
    throw new HTTPException(403, { message: 'No hospital association' });
  }
  return await next();
});
