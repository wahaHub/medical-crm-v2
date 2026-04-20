import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError, NotFoundError, ForbiddenError, mapErrorToStatus } from '@medical-crm/utils';

vi.mock('../middleware/security.js', () => ({
  applySecurityMiddleware: vi.fn(),
  perUserRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@medical-crm/infrastructure/database/retry', () => ({
  isTransientDatabaseError: vi.fn(() => false),
}));

vi.mock('@medical-crm/validation', () => ({
  registerHospitalUserSchema: {
    parse: (value: unknown) => value,
  },
}));

vi.mock('../composition-root.js', () => ({
  getServices: () => ({
    registerHospitalUser: { execute: vi.fn(async () => ({})) },
    validateRegistrationToken: { execute: vi.fn(async () => ({})) },
  }),
}));

vi.mock('../routes/index.js', async () => {
  const { Hono } = await import('hono');
  const router = new Hono();
  router.get('/missing-response', () => {
    throw new Error('Context is not finalized. Did you forget to return a Response object or `await next()`?');
  });
  return { default: router };
});

vi.mock('../routes/internal.routes.js', async () => {
  const { Hono } = await import('hono');
  return { default: new Hono() };
});

vi.mock('../routes/patient-public.routes.js', async () => {
  const { Hono } = await import('hono');
  return { default: new Hono() };
});

vi.mock('../routes/patient-auth.routes.js', async () => {
  const { Hono } = await import('hono');
  return { default: new Hono() };
});

vi.mock('../routes/patient-protected.routes.js', async () => {
  const { Hono } = await import('hono');
  return { default: new Hono() };
});

vi.mock('../routes/public-booking.routes.js', async () => {
  const { Hono } = await import('hono');
  return { default: new Hono() };
});

vi.mock('../routes/chatbot.routes.js', async () => {
  const { Hono } = await import('hono');
  return { chatbotPublicRoutes: new Hono() };
});

vi.mock('../routes/chatbot-v3.routes.js', async () => {
  const { Hono } = await import('hono');
  return { chatbotV3PublicRoutes: new Hono() };
});

function createTestApp() {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof DomainError) {
      const status = mapErrorToStatus(err.code);
      return c.json({ error: err.message, code: err.code }, status as 200 | 400 | 401 | 403 | 404 | 500);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });
  return app;
}

describe('Global error handler', () => {
  it('maps HTTPException to correct status', async () => {
    const app = createTestApp();
    app.get('/throw-http', () => {
      throw new HTTPException(422, { message: 'Invalid data' });
    });

    const res = await app.request('/throw-http');
    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('Invalid data');
  });

  it('maps NotFoundError to 404', async () => {
    const app = createTestApp();
    app.get('/throw-notfound', () => {
      throw new NotFoundError('Hospital not found');
    });

    const res = await app.request('/throw-notfound');
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('Hospital not found');
    expect(body['code']).toBe('NOT_FOUND');
  });

  it('maps ForbiddenError to 403', async () => {
    const app = createTestApp();
    app.get('/throw-forbidden', () => {
      throw new ForbiddenError('Not allowed');
    });

    const res = await app.request('/throw-forbidden');
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('FORBIDDEN');
  });

  it('maps unhandled error to 500', async () => {
    const app = createTestApp();
    app.get('/throw-generic', () => {
      throw new Error('Something broke');
    });

    const res = await app.request('/throw-generic');
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('Internal server error');
  });

  it('leaves unfinalized-context errors as 500s so router bugs stay visible', async () => {
    const { default: app } = await import('../index');

    const res = await app.request('/missing-response');

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('Internal server error');
  });

  it('mapErrorToStatus utility works end-to-end', () => {
    expect(mapErrorToStatus('NOT_FOUND')).toBe(404);
    expect(mapErrorToStatus('FORBIDDEN')).toBe(403);
    expect(mapErrorToStatus('EMAIL_ROLE_CONFLICT')).toBe(409);
    expect(mapErrorToStatus('PATIENT_ALREADY_EXISTS')).toBe(409);
    expect(mapErrorToStatus('SOMETHING_ELSE')).toBe(500);
  });
});
