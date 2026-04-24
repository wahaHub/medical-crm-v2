import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { PatientAuthService, PatientSessionPayload, PatientSite } from '@medical-crm/domain';
import { PatientSiteContextError, resolvePatientSiteContext } from '../patient-site-context.js';

declare module 'hono' {
  interface ContextVariableMap {
    patientSession: PatientSessionPayload;
    patientSite: PatientSite;
  }
}

export function patientAuthMiddleware(
  authService: PatientAuthService,
): MiddlewareHandler {
  return async (c, next) => {
    let site: PatientSite;
    try {
      site = resolvePatientSiteContext(c);
    } catch (error) {
      if (error instanceof PatientSiteContextError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
    const token = getCookie(c, 'patient_session');
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const payload = await authService.verifySessionToken(token, site);
      c.set('patientSession', payload);
      c.set('patientSite', site);
      return await next();
    } catch {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }
  };
}
