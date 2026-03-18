import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { getServices } from '../composition-root.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';
import { initOnboardingSchema, matchHospitalsSchema } from '@medical-crm/validation';

const app = new Hono();

const PROCEDURE_FALLBACK: Record<string, Array<{ id: string; name: string }>> = {
  face: [
    { id: 'face-rhinoplasty', name: 'Rhinoplasty' },
    { id: 'face-blepharoplasty', name: 'Blepharoplasty' },
    { id: 'face-facelift', name: 'Facelift' },
  ],
  body: [
    { id: 'body-liposuction', name: 'Liposuction' },
    { id: 'body-abdominoplasty', name: 'Abdominoplasty' },
    { id: 'body-breast-augmentation', name: 'Breast Augmentation' },
  ],
  'non-surgical': [
    { id: 'non-surgical-botox', name: 'Botox' },
    { id: 'non-surgical-fillers', name: 'Dermal Fillers' },
    { id: 'non-surgical-laser', name: 'Laser Resurfacing' },
  ],
};

async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean };
  return Boolean(result.success);
}

// POST /onboarding/init — rate limited
app.post('/onboarding/init', rateLimitByIp({ maxRequests: 5, windowMs: 3600_000 }), async (c) => {
  const body = initOnboardingSchema.parse(await c.req.json());
  const remoteIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined;
  const captchaValid = await verifyTurnstileToken(body.captchaToken, remoteIp);
  if (!captchaValid) {
    return c.json({ error: 'Captcha verification failed' }, 400);
  }
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

// GET /procedures
app.get('/procedures', async (c) => {
  const category = c.req.query('category');
  const normalizedCategory = (category && category in PROCEDURE_FALLBACK)
    ? category
    : null;

  if (normalizedCategory) {
    return c.json({ procedures: PROCEDURE_FALLBACK[normalizedCategory] ?? [] });
  }

  return c.json({
    procedures: Object.values(PROCEDURE_FALLBACK).flat(),
  });
});

// GET /destinations
app.get('/destinations', async (c) => {
  return c.json({
    destinations: ['Seoul', 'Bangkok', 'Tokyo', 'Shanghai', 'Singapore'],
  });
});

export default app;
