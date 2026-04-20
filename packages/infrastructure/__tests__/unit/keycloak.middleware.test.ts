import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const mockJwtVerify = vi.fn();
const mockCreateRemoteJWKSet = vi.fn(() => 'jwks');
const mockGetCrmDb = vi.fn();

vi.mock('jose', () => ({
  jwtVerify: mockJwtVerify,
  createRemoteJWKSet: mockCreateRemoteJWKSet,
}));

vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    KEYCLOAK_ISSUER: 'https://keycloak.example/realms/medora',
    KEYCLOAK_CLIENT_ID: 'hospital-portal',
  }),
}));

vi.mock('../../database/crm-client.js', () => ({
  getCrmDb: mockGetCrmDb,
}));

function makeLookupDb(
  results: Array<Error | Array<{ id: string; hospitalId: string | null }>>,
  options: { updateError?: Error } = {},
) {
  const limit = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next ?? [];
  });
  const where = vi.fn(async () => {
    if (options.updateError) {
      throw options.updateError;
    }
  });
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit,
          }),
        }),
      }),
      update,
    },
    limit,
    update,
    set,
    where,
  };
}

async function createApp() {
  const { authMiddleware } = await import('../../auth/keycloak.middleware.js');
  const app = new Hono();
  app.use('/*', authMiddleware);
  app.get('/test', (c) => c.json(c.get('session')));
  return app;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    mockJwtVerify.mockReset();
    mockCreateRemoteJWKSet.mockClear();
    mockGetCrmDb.mockReset();
  });

  it('returns 401 when JWT verification fails', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('jwt expired'));

    const app = await createApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(401);
    expect(mockGetCrmDb).not.toHaveBeenCalled();
  });

  it('returns 503 instead of 401 when CRM identity lookup has a transient database failure', async () => {
    const dbError = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const lookup = makeLookupDb([dbError, dbError]);

    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: 'kc-user-1',
        email: 'hospital@example.com',
        azp: 'hospital-portal',
        realm_access: { roles: [] },
      },
    });
    mockGetCrmDb.mockReturnValue(lookup.db);

    const app = await createApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer flaky-db-token' },
    });

    expect(res.status).toBe(503);
    expect(lookup.limit).toHaveBeenCalledTimes(2);
  });

  it('retries a transient CRM identity lookup failure once and keeps the session alive when retry succeeds', async () => {
    const dbError = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const lookup = makeLookupDb([
      dbError,
      [{ id: 'crm-user-1', hospitalId: 'hospital-1' }],
    ]);

    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: 'kc-user-1',
        email: 'hospital@example.com',
        azp: 'hospital-portal',
        realm_access: { roles: [] },
      },
    });
    mockGetCrmDb.mockReturnValue(lookup.db);

    const app = await createApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer recoverable-db-token' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      userId: 'crm-user-1',
      email: 'hospital@example.com',
      hospitalId: 'hospital-1',
    });
    expect(lookup.limit).toHaveBeenCalledTimes(2);
  });

  it('reuses a cached CRM identity across repeated requests for the same token subject', async () => {
    const lookup = makeLookupDb([
      [{ id: 'crm-user-1', hospitalId: 'hospital-1' }],
    ]);

    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'kc-user-1',
        email: 'hospital@example.com',
        azp: 'hospital-portal',
        realm_access: { roles: ['hospital'] },
      },
    });
    mockGetCrmDb.mockReturnValue(lookup.db);

    const app = await createApp();

    const first = await app.request('/test', {
      headers: { Authorization: 'Bearer cached-token' },
    });
    const second = await app.request('/test', {
      headers: { Authorization: 'Bearer cached-token' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(lookup.limit).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent cold-miss CRM identity lookups for the same token subject', async () => {
    let resolveLookup: ((value: Array<{ id: string; hospitalId: string | null }>) => void) | undefined;
    const lookupPromise = new Promise<Array<{ id: string; hospitalId: string | null }>>((resolve) => {
      resolveLookup = resolve;
    });
    const limit = vi.fn(() => lookupPromise);

    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'kc-user-1',
        email: 'hospital@example.com',
        azp: 'hospital-portal',
        realm_access: { roles: ['hospital'] },
      },
    });
    mockGetCrmDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit,
          }),
        }),
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(),
        })),
      })),
    });

    const app = await createApp();
    const firstResponsePromise = app.request('/test', {
      headers: { Authorization: 'Bearer dedupe-token' },
    });
    const secondResponsePromise = app.request('/test', {
      headers: { Authorization: 'Bearer dedupe-token' },
    });

    await Promise.resolve();
    expect(limit).toHaveBeenCalledTimes(1);

    resolveLookup?.([{ id: 'crm-user-1', hospitalId: 'hospital-1' }]);

    const [firstResponse, secondResponse] = await Promise.all([
      firstResponsePromise,
      secondResponsePromise,
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('throttles last_login_at writes so repeated requests do not update on every call', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00.000Z'));

    const lookup = makeLookupDb([
      [{ id: 'crm-user-1', hospitalId: 'hospital-1' }],
    ]);

    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'kc-user-1',
        email: 'hospital@example.com',
        azp: 'hospital-portal',
        realm_access: { roles: ['hospital'] },
      },
    });
    mockGetCrmDb.mockReturnValue(lookup.db);

    const app = await createApp();

    const first = await app.request('/test', {
      headers: { Authorization: 'Bearer throttle-token' },
    });
    await Promise.resolve();

    vi.setSystemTime(new Date('2026-04-20T12:00:30.000Z'));
    const second = await app.request('/test', {
      headers: { Authorization: 'Bearer throttle-token' },
    });
    await Promise.resolve();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(lookup.where).toHaveBeenCalledTimes(1);
  });
});
