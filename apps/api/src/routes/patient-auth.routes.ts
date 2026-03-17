import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import { getServices } from '../composition-root.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';
import { magicLinkSchema, verifyTokenSchema, setPasswordSchema } from '@medical-crm/validation';

const app = new Hono();

// POST /magic-link — rate limited, no auth
app.post('/magic-link', rateLimitByIp({ maxRequests: 3, windowMs: 3600_000 }), async (c) => {
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
  const session = await patientAuthService.verifySessionToken(tokenCookie);

  const { password } = setPasswordSchema.parse(await c.req.json());
  const { setPassword } = getServices();
  await setPassword.execute({ userId: session.userId, password });
  return c.json({ ok: true });
});

export default app;
