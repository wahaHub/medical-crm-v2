import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as jose from 'jose';
import { getServerEnv } from '@medical-crm/config';

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

export const authMiddleware = createMiddleware<{ Variables: { session: Session } }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const env = getServerEnv();

    try {
      const { payload } = await jose.jwtVerify(token, getJWKS(), {
        issuer: env.KEYCLOAK_ISSUER,
        audience: env.KEYCLOAK_CLIENT_ID,
      });

      c.set('session', {
        userId: payload.sub!,
        email: payload.email as string,
        roles: (payload.realm_access as { roles?: string[] })?.roles ?? [],
        hospitalId: (payload as Record<string, unknown>).hospital_id as string ?? null,
      });
    } catch {
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
