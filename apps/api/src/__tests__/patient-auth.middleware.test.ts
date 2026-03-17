import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { patientAuthMiddleware } from '../middleware/patient-auth.middleware.js';
import { PatientAuthService } from '@medical-crm/domain';

describe('patientAuthMiddleware', () => {
  const secret = 'test-secret';
  const authService = new PatientAuthService(secret);

  function createApp() {
    const app = new Hono();
    app.use('/*', patientAuthMiddleware(authService));
    app.get('/test', (c) => {
      const patient = c.get('patientSession');
      return c.json({ userId: patient.userId });
    });
    return app;
  }

  it('returns 401 when no cookie present', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid session cookie', async () => {
    const app = createApp();
    const token = await authService.createSessionToken('user-1');
    const res = await app.request('/test', {
      headers: { Cookie: `patient_session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
  });

  it('returns 401 with expired cookie', async () => {
    const app = createApp();
    const token = await authService.createSessionToken('user-1', -1);
    const res = await app.request('/test', {
      headers: { Cookie: `patient_session=${token}` },
    });
    expect(res.status).toBe(401);
  });
});
