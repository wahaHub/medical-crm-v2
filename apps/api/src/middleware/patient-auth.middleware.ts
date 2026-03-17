import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { PatientAuthService, PatientSessionPayload } from '@medical-crm/domain';

declare module 'hono' {
  interface ContextVariableMap {
    patientSession: PatientSessionPayload;
  }
}

export function patientAuthMiddleware(
  authService: PatientAuthService,
): MiddlewareHandler {
  return async (c, next) => {
    const token = getCookie(c, 'patient_session');
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const payload = await authService.verifySessionToken(token);
      c.set('patientSession', payload);
      await next();
    } catch {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }
  };
}
