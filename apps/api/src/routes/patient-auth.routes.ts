import { Hono } from 'hono';
import { deleteCookie, setCookie, getCookie } from 'hono/cookie';
import { getServices } from '../composition-root.js';
import { rateLimitByIp, rateLimitByKey } from '../middleware/rate-limit.middleware.js';
import { magicLinkSchema, verifyTokenSchema, setPasswordSchema } from '@medical-crm/validation';

const app = new Hono();

// POST /magic-link — rate limited by email, no auth
app.post('/magic-link', rateLimitByKey({
  maxRequests: 3,
  windowMs: 3600_000,
}, async (c) => {
  try {
    const body = await c.req.raw.clone().json();
    if (typeof body === 'object' && body && 'email' in body && typeof body.email === 'string') {
      return body.email;
    }
  } catch {
    // noop: validation middleware below handles payload
  }
  return 'unknown';
}), async (c) => {
  const { email } = magicLinkSchema.parse(await c.req.json());
  const { sendMagicLink } = getServices();
  await sendMagicLink.execute({ email });
  return c.json({ ok: true });
});

// POST /verify-token — no auth (this IS the login)
app.post('/verify-token', async (c) => {
  const { token } = verifyTokenSchema.parse(await c.req.json());
  const { verifyMagicLink } = getServices();
  const result = await verifyMagicLink.execute({ token });
  setCookie(c, 'patient_session', result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });
  return c.json({ patientId: result.patientId });
});

// POST /set-password — requires auth
app.post('/set-password', async (c) => {
  const { patientAuthService } = getServices();
  const tokenCookie = getCookie(c, 'patient_session');
  if (!tokenCookie) return c.json({ error: 'Unauthorized' }, 401);
  let session: { userId: string };
  try {
    session = await patientAuthService.verifySessionToken(tokenCookie);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { password } = setPasswordSchema.parse(await c.req.json());
  const { setPassword } = getServices();
  await setPassword.execute({ userId: session.userId, password });
  return c.json({ ok: true });
});

// POST /logout — clear patient cookie
app.post('/logout', rateLimitByIp({ maxRequests: 20, windowMs: 60_000 }), async (c) => {
  deleteCookie(c, 'patient_session', { path: '/' });
  return c.json({ ok: true });
});

export default app;
