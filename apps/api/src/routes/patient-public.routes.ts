import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { getServices } from '../composition-root.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';
import { initOnboardingSchema, matchHospitalsSchema } from '@medical-crm/validation';

const app = new Hono();

// POST /onboarding/init — rate limited
app.post('/onboarding/init', rateLimitByIp({ maxRequests: 5, windowMs: 3600_000 }), async (c) => {
  const body = initOnboardingSchema.parse(await c.req.json());
  const { initOnboarding } = getServices();
  const result = await initOnboarding.execute(body);
  setCookie(c, 'patient_session', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });
  return c.json({ patientId: result.patientId, caseId: result.caseId, isExistingPatient: result.isExistingPatient });
});

// POST /match-hospitals
app.post('/match-hospitals', async (c) => {
  const body = matchHospitalsSchema.parse(await c.req.json());
  const { matchHospitals } = getServices();
  const result = await matchHospitals.execute(body);
  return c.json(result);
});

export default app;
