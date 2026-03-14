import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock jose
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

// Mock config
vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    KEYCLOAK_ISSUER: 'https://keycloak.test/realms/test',
    KEYCLOAK_CLIENT_ID: 'portal-web',
  }),
}));

describe('authMiddleware', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'user-123',
        email: 'test@example.com',
        realm_access: { roles: ['hospital'] },
        hospital_id: 'hospital-456',
      },
    });

    const { authMiddleware } = await import('../keycloak.middleware');
    app = new Hono();
    app.use('/*', authMiddleware);
    app.get('/test', (c) => {
      const session = c.get('session');
      return c.json(session);
    });
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-Bearer token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc' },
    });
    expect(res.status).toBe(401);
  });

  it('extracts session from valid JWT', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: 'user-123',
      email: 'test@example.com',
      roles: ['hospital'],
      hospitalId: 'hospital-456',
    });
  });

  it('returns 401 for invalid JWT', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockRejectedValue(new Error('invalid'));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows matching role', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        realm_access: { roles: ['admin'] },
      },
    });

    const { authMiddleware, requireRole } = await import('../keycloak.middleware');
    const app = new Hono();
    app.use('/*', authMiddleware);
    app.use('/*', requireRole('admin'));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects non-matching role', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        realm_access: { roles: ['hospital'] },
      },
    });

    const { authMiddleware, requireRole } = await import('../keycloak.middleware');
    const app = new Hono();
    app.use('/*', authMiddleware);
    app.use('/*', requireRole('admin'));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(403);
  });
});

describe('requireHospital', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects user without hospitalId', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as any).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        realm_access: { roles: ['admin'] },
      },
    });

    const { authMiddleware, requireHospital } = await import('../keycloak.middleware');
    const app = new Hono();
    app.use('/*', authMiddleware);
    app.use('/*', requireHospital);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(403);
  });
});
