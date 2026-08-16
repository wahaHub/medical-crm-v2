import { Hono } from 'hono';
import { deleteCookie, setCookie, getCookie } from 'hono/cookie';
import type { PatientSite } from '@medical-crm/domain';
import { getServices } from '../composition-root.js';
import { rateLimitByIp, rateLimitByKey } from '../middleware/rate-limit.middleware.js';
import {
  EmailRoleConflictError,
  PatientMergedError,
  RestoreGuestSessionAuthError,
  VerifyMagicLinkAuthError,
  VerifyPatientEntryTokenAuthError,
} from '@medical-crm/application';
import { magicLinkSchema, patientPasswordLoginSchema, verifyRegisterTokenSchema, verifyTokenSchema, restoreTokenSchema, setPasswordSchema } from '@medical-crm/validation';
import { PatientSiteContextError, readPatientSiteContext, resolvePatientSiteContext } from '../patient-site-context.js';

const app = new Hono();
const RESTORE_RATE_LIMIT = process.env.NODE_ENV === 'production'
  ? { maxRequests: 20, windowMs: 3600_000 }
  : { maxRequests: 200, windowMs: 600_000 };
const PATIENT_SESSION_COOKIE = 'patient_session';
const PATIENT_RESTORE_COOKIE = 'patient_restore';

function setPatientSessionCookies(c: Parameters<typeof setCookie>[0], sessionToken: string, restoreCookie: string): void {
  setCookie(c, PATIENT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });
  setCookie(c, PATIENT_RESTORE_COOKIE, restoreCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });
}

async function buildPatientSessionResponse(
  patientId: string,
  restoreToken: string,
  site: PatientSite,
): Promise<Record<string, unknown>> {
  const { getPatientSessionState } = getServices();
  const sessionState = await getPatientSessionState.execute({ patientId, site });
  return {
    ...sessionState,
    restoreToken,
  };
}

// POST /magic-link — rate limited by email, no auth
app.post('/magic-link', rateLimitByKey({
  maxRequests: 3,
  windowMs: 3600_000,
}, async (c) => {
  try {
    const body = await c.req.raw.clone().json();
    const site = readPatientSiteContext(c) ?? 'invalid';
    if (typeof body === 'object' && body && 'email' in body && typeof body.email === 'string') {
      return `${site}:${body.email}`;
    }
  } catch {
    // noop: validation middleware below handles payload
  }
  return 'unknown';
}), async (c) => {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const { email } = magicLinkSchema.parse(await c.req.json());
  const { sendPatientLoginLink } = getServices();
  try {
    await sendPatientLoginLink.execute({ email, site });
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof EmailRoleConflictError) {
      return c.json({ error: error.message, code: error.code }, 409);
    }
    throw error;
  }
});

// POST /verify-token — no auth (this IS the login)
app.post('/verify-token', async (c) => {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const { token } = verifyTokenSchema.parse(await c.req.json());
  const { verifyMagicLink } = getServices();
  let result;
  try {
    result = await verifyMagicLink.execute({ token, site });
  } catch (error) {
    if (error instanceof PatientMergedError) {
      return c.json({ error: error.message, code: error.code }, 403);
    }
    if (error instanceof VerifyMagicLinkAuthError) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    throw error;
  }
  setPatientSessionCookies(c, result.sessionToken, result.restoreCookie);
  return c.json(await buildPatientSessionResponse(result.patientId, result.restoreToken, site));
});

// POST /register-token/verify — no auth, does not create a session
app.post('/register-token/verify', async (c) => {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const { token } = verifyRegisterTokenSchema.parse(await c.req.json());
  const { verifyPatientEntryToken } = getServices();
  let result;
  try {
    result = await verifyPatientEntryToken.execute({ token, site });
  } catch (error) {
    if (error instanceof VerifyPatientEntryTokenAuthError) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    throw error;
  }
  if (result.purpose !== 'patient-register') {
    return c.json({ error: 'Invalid token purpose' }, 400);
  }
  return c.json({
    email: result.email,
    purpose: result.purpose,
  });
});

// POST /login — patient email + password login
app.post('/login', async (c) => {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const { email, password } = patientPasswordLoginSchema.parse(await c.req.json());
  const { loginWithPassword } = getServices();

  try {
    const result = await loginWithPassword.execute({ email, password, site });
    setPatientSessionCookies(c, result.sessionToken, result.restoreCookie);
  return c.json(await buildPatientSessionResponse(result.patientId, result.restoreToken, site));
  } catch (error) {
    if (error instanceof PatientMergedError) {
      return c.json({ error: error.message, code: error.code }, 403);
    }
    const message = error instanceof Error ? error.message : 'Invalid credentials';
    if (message === 'Invalid credentials') {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    throw error;
  }
});

// POST /session/restore — rate limited by IP
app.post('/session/restore', rateLimitByIp(RESTORE_RATE_LIMIT), async (c) => {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const parsed = restoreTokenSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Validation failed' }, 400);
  }

  const restoreCookie = getCookie(c, PATIENT_RESTORE_COOKIE);
  if (!restoreCookie) return c.json({ error: 'Unauthorized' }, 401);

  const { restoreGuestSession } = getServices();
  try {
    const result = await restoreGuestSession.execute({
      restoreToken: parsed.data.restoreToken,
      restoreCookie,
      site,
    });
    setPatientSessionCookies(c, result.sessionToken, result.restoreCookie);
    return c.json(await buildPatientSessionResponse(result.patientId, result.restoreToken, site));
  } catch (error) {
    if (error instanceof PatientMergedError) {
      return c.json({ error: error.message, code: error.code }, 403);
    }
    if (error instanceof RestoreGuestSessionAuthError) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    throw error;
  }
});

// POST /set-password — requires auth
app.post('/set-password', async (c) => {
  let site;
  try {
    site = resolvePatientSiteContext(c);
  } catch (error) {
    if (error instanceof PatientSiteContextError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const { patientAuthService } = getServices();
  const tokenCookie = getCookie(c, 'patient_session');
  if (!tokenCookie) return c.json({ error: 'Unauthorized' }, 401);
  let session: { userId: string };
  try {
    session = await patientAuthService.verifySessionToken(tokenCookie, site);
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
  deleteCookie(c, PATIENT_SESSION_COOKIE, { path: '/' });
  deleteCookie(c, PATIENT_RESTORE_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

export default app;
