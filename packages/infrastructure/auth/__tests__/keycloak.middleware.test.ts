import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock jose
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

const crmDbMock = {
  select: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../database/crm-client.js', () => ({
  getCrmDb: () => crmDbMock,
}));

// Mock config
vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    KEYCLOAK_ISSUER: 'https://keycloak.test/realms/test',
    KEYCLOAK_CLIENT_ID: 'portal-web',
  }),
}));

function mockCrmIdentity(identity: {
  id: string;
  hospitalId: string | null;
  keycloakUserId: string | null;
}) {
  crmDbMock.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue([identity]),
      }),
    }),
  }));
  crmDbMock.update.mockImplementation(() => ({
    set: () => ({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }));
}

describe('authMiddleware', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const { jwtVerify } = await import('jose');
    (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      payload: {
        sub: 'user-123',
        email: 'test@example.com',
        azp: 'portal-web',
        realm_access: { roles: ['hospital'] },
        hospital_id: 'hospital-456',
      },
    });

    mockCrmIdentity({
      id: 'crm-user-123',
      hospitalId: 'hospital-456',
      keycloakUserId: 'user-123',
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
      userId: 'crm-user-123',
      keycloakUserId: 'user-123',
      email: 'test@example.com',
      roles: ['hospital'],
      hospitalId: 'hospital-456',
    });
  });

  it('falls back to email lookup and backfills keycloak user id', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      payload: {
        sub: 'user-123',
        email: 'test@example.com',
        azp: 'portal-web',
        realm_access: { roles: ['patient'] },
        hospital_id: 'hospital-456',
      },
    });

    crmDbMock.select
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'crm-user-456',
                hospitalId: 'hospital-456',
                keycloakUserId: null,
              },
            ]),
          }),
        }),
      }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('crm-user-456');
    expect(body.keycloakUserId).toBe('user-123');
    expect(crmDbMock.update).toHaveBeenCalledOnce();
  });

  it('returns 401 for invalid JWT', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('invalid'));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCrmIdentity({
      id: 'crm-user-role',
      hospitalId: 'hospital-456',
      keycloakUserId: 'u1',
    });
  });

  it('allows matching role', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        azp: 'portal-web',
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
    (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        azp: 'portal-web',
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
    vi.clearAllMocks();
    mockCrmIdentity({
      id: 'crm-user-admin',
      hospitalId: null,
      keycloakUserId: 'u1',
    });
  });

  it('rejects user without hospitalId', async () => {
    const { jwtVerify } = await import('jose');
    (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      payload: {
        sub: 'u1',
        email: 'a@b.com',
        azp: 'portal-web',
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
