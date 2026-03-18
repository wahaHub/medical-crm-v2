import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Session mock factory — creates a fresh session object for each test
// ---------------------------------------------------------------------------
const mockSave = vi.fn();
const mockDestroy = vi.fn();

// currentSession holds a reference to the session object the mock returns so
// that tests can inspect mutations the route handlers make to it.
let currentSession: Record<string, unknown> & {
  save: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function createSession(initial: Record<string, unknown> = {}) {
  currentSession = {
    ...initial,
    save: mockSave,
    destroy: mockDestroy,
  };
  return currentSession;
}

// ---------------------------------------------------------------------------
// Mock iron-session — getIronSession returns currentSession
// ---------------------------------------------------------------------------
vi.mock('iron-session', () => ({
  getIronSession: vi.fn(() => Promise.resolve(currentSession)),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(new Map())),
}));

// Mock next/navigation (used by api-client) — throw a detectable error
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const ENV = {
  KEYCLOAK_ISSUER: 'https://auth.example.com/realms/test',
  KEYCLOAK_CLIENT_ID: 'admin-client',
  KEYCLOAK_CLIENT_SECRET: 'super-secret',
  ADMIN_ORIGIN: 'https://admin.example.com',
  HOSPITAL_ORIGIN: 'https://hospital.example.com',
  SESSION_SECRET: 'test-session-secret-32-chars-min!!',
  API_URL: 'http://localhost:3001',
};

function makeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

// ---------------------------------------------------------------------------
// Login route tests
// ---------------------------------------------------------------------------
describe('admin auth — login route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSave.mockReset();
    mockDestroy.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    createSession({});
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeLoginRequest(body: Record<string, unknown>) {
    return new NextRequest('https://admin.example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 400 when username/password are missing', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(makeLoginRequest({ username: '' }));
    expect(response.status).toBe(400);
  });

  it('returns 401 when credentials are invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error_description: 'Bad credentials',
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(makeLoginRequest({ username: 'x', password: 'y' }));
    expect(response.status).toBe(401);
  });

  it('creates admin session and redirects to / for admin role', async () => {
    const adminToken = makeJwt({
      sub: 'admin-sub',
      email: 'admin@medicaltourismchina.health',
      realm_access: { roles: ['admin'] },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        access_token: adminToken,
        refresh_token: 'refresh-token',
        id_token: 'id-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(makeLoginRequest({ username: 'admin', password: 'pw' }));

    expect(response.status).toBe(200);
    const body = await response.json() as { success?: boolean; redirectTo?: string };
    expect(body.success).toBe(true);
    expect(body.redirectTo).toBe('/');
    expect(mockSave).toHaveBeenCalledOnce();
    expect(currentSession.access_token).toBe(adminToken);
    expect(currentSession.refresh_token).toBe('refresh-token');
  });

  it('sets hospital cookie and redirects to hospital origin for hospital role', async () => {
    const hospitalToken = makeJwt({
      sub: 'hospital-sub',
      email: 'hospital@example.com',
      realm_access: { roles: ['hospital'] },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        access_token: hospitalToken,
        refresh_token: 'refresh-token',
        id_token: 'id-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(makeLoginRequest({ username: 'hospital', password: 'pw' }));

    expect(response.status).toBe(200);
    const body = await response.json() as { success?: boolean; redirectTo?: string };
    expect(body.success).toBe(true);
    expect(body.redirectTo).toBe(ENV.HOSPITAL_ORIGIN);
    expect(response.headers.get('set-cookie')).toContain('medical-crm-hospital-session=');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns 403 when role is not admin/hospital', async () => {
    const otherToken = makeJwt({
      sub: 'other-sub',
      email: 'someone@example.com',
      realm_access: { roles: ['patient'] },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        access_token: otherToken,
        refresh_token: 'refresh-token',
        id_token: 'id-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(makeLoginRequest({ username: 'other', password: 'pw' }));
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Callback route tests
// ---------------------------------------------------------------------------
describe('admin auth — callback route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSave.mockReset();
    mockDestroy.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    createSession({});
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeRequest(search: string) {
    return new NextRequest(`https://admin.example.com/auth/callback${search}`);
  }

  it('redirects to /auth/login when no code param is present', async () => {
    createSession({ code_verifier: 'some-verifier' });
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(makeRequest(''));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('redirects to /auth/login when session has no code_verifier', async () => {
    createSession({});
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(makeRequest('?code=auth-code-123'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('redirects to /auth/login when token exchange returns non-ok response', async () => {
    createSession({ code_verifier: 'my-verifier' });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(makeRequest('?code=bad-code'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('saves access/refresh token to session and redirects to / on successful exchange', async () => {
    const fakeTokens = {
      access_token: 'access-abc',
      refresh_token: 'refresh-xyz',
      id_token: 'id-tok-123',
      expires_in: 300,
    };
    createSession({ code_verifier: 'my-verifier' });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fakeTokens), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(makeRequest('?code=valid-code'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toMatch(/\/$/);

    expect(currentSession.access_token).toBe('access-abc');
    expect(currentSession.refresh_token).toBe('refresh-xyz');
    expect(currentSession.id_token).toBeUndefined();
    expect(typeof currentSession.expires_at).toBe('number');
    expect(currentSession.expires_at as number).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('deletes code_verifier from session after successful exchange', async () => {
    const fakeTokens = {
      access_token: 'access-abc',
      refresh_token: 'refresh-xyz',
      id_token: 'id-tok-123',
      expires_in: 300,
    };
    createSession({ code_verifier: 'my-verifier' });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fakeTokens), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/auth/callback/route');
    await GET(makeRequest('?code=valid-code'));

    // The route does `delete session.code_verifier` — on a plain object this
    // removes the own property so it becomes undefined.
    expect(currentSession.code_verifier).toBeUndefined();
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('sends the correct token exchange request to Keycloak', async () => {
    const fakeTokens = {
      access_token: 'access-abc',
      refresh_token: 'refresh-xyz',
      id_token: 'id-tok-123',
      expires_in: 300,
    };
    createSession({ code_verifier: 'test-verifier-value' });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fakeTokens), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/auth/callback/route');
    await GET(makeRequest('?code=my-auth-code'));

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];

    expect(url).toBe(`${ENV.KEYCLOAK_ISSUER}/protocol/openid-connect/token`);
    expect(options.method).toBe('POST');

    const body = new URLSearchParams(options.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe(ENV.KEYCLOAK_CLIENT_ID);
    expect(body.get('code')).toBe('my-auth-code');
    expect(body.get('code_verifier')).toBe('test-verifier-value');
    expect(body.get('redirect_uri')).toBe(`${ENV.ADMIN_ORIGIN}/auth/callback`);
  });
});

// ---------------------------------------------------------------------------
// Logout route tests
// ---------------------------------------------------------------------------
describe('admin auth — logout route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSave.mockReset();
    mockDestroy.mockReset();
    createSession({});
    Object.assign(process.env, ENV);
  });

  it('redirects to Keycloak end-session endpoint', async () => {
    createSession({ id_token: 'my-id-token' });
    const { GET } = await import('@/app/auth/logout/route');
    const response = await GET();

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain(`${ENV.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`);
  });

  it('includes id_token_hint in the redirect URL when id_token is set', async () => {
    createSession({ id_token: 'my-id-token' });
    const { GET } = await import('@/app/auth/logout/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    const url = new URL(location);

    expect(url.searchParams.get('id_token_hint')).toBe('my-id-token');
    expect(url.searchParams.get('client_id')).toBe(ENV.KEYCLOAK_CLIENT_ID);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(ENV.ADMIN_ORIGIN);
  });

  it('omits id_token_hint when no id_token in session', async () => {
    createSession({});
    const { GET } = await import('@/app/auth/logout/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    const url = new URL(location);

    expect(url.searchParams.has('id_token_hint')).toBe(false);
    expect(url.searchParams.get('client_id')).toBe(ENV.KEYCLOAK_CLIENT_ID);
  });

  it('calls session.destroy() (via clearSession) to clear the session', async () => {
    createSession({ id_token: 'my-id-token' });
    const { GET } = await import('@/app/auth/logout/route');
    await GET();

    expect(mockDestroy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// API client tests
// ---------------------------------------------------------------------------
describe('admin api-client', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSave.mockReset();
    mockDestroy.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    createSession({});
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws redirect to /auth/login when there is no access_token', async () => {
    createSession({});
    const { apiClient } = await import('@/lib/api-client');

    await expect(apiClient('/api/test')).rejects.toThrow('REDIRECT:/auth/login');
  });

  it('includes Bearer token in Authorization header', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    createSession({ access_token: 'my-bearer-token', expires_at: futureExpiry });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const { apiClient } = await import('@/lib/api-client');
    await apiClient('/api/data');

    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-bearer-token');
  });

  it('calls the correct API URL', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    createSession({ access_token: 'my-bearer-token', expires_at: futureExpiry });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const { apiClient } = await import('@/lib/api-client');
    await apiClient('/api/patients');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENV.API_URL}/api/patients`);
  });

  it('refreshes token when within 60 seconds of expiry', async () => {
    // expires in 30s — within the 60s refresh window
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    createSession({
      access_token: 'old-access-token',
      refresh_token: 'my-refresh-token',
      expires_at: nearExpiry,
    });

    const refreshResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const { apiClient } = await import('@/lib/api-client');
    await apiClient('/api/data');

    // First call should be the token refresh
    const [firstUrl, firstOptions] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe(`${ENV.KEYCLOAK_ISSUER}/protocol/openid-connect/token`);
    const body = new URLSearchParams(firstOptions.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('my-refresh-token');

    // Second call uses the new access token
    const [, secondOptions] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    const headers = secondOptions.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer new-access-token');
  });

  it('does not refresh token when expiry is more than 60 seconds away', async () => {
    const farExpiry = Math.floor(Date.now() / 1000) + 3600;
    createSession({ access_token: 'valid-token', expires_at: farExpiry });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const { apiClient } = await import('@/lib/api-client');
    await apiClient('/api/data');

    // Only one fetch call — no refresh
    expect(fetch).toHaveBeenCalledOnce();
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENV.API_URL}/api/data`);
  });

  it('destroys session and redirects to /auth/login when refresh fails', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    createSession({
      access_token: 'old-token',
      refresh_token: 'bad-refresh-token',
      expires_at: nearExpiry,
    });

    // Refresh fetch returns a 401
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const { apiClient } = await import('@/lib/api-client');

    await expect(apiClient('/api/data')).rejects.toThrow('REDIRECT:/auth/login');
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it('destroys session and redirects to /auth/login when refresh fetch throws', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    createSession({
      access_token: 'old-token',
      refresh_token: 'bad-refresh-token',
      expires_at: nearExpiry,
    });

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { apiClient } = await import('@/lib/api-client');

    await expect(apiClient('/api/data')).rejects.toThrow('REDIRECT:/auth/login');
    expect(mockDestroy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Middleware tests
// ---------------------------------------------------------------------------
describe('admin middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns NextResponse.next() when the admin session cookie is present', async () => {
    const { middleware } = await import('@/middleware');

    const request = new NextRequest('https://admin.example.com/dashboard', {
      headers: {
        cookie: 'medical-crm-admin-session=some-encrypted-value',
      },
    });

    const response = middleware(request);

    // NextResponse.next() has status 200 and no Location header
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects to /auth/login when no session cookie is present', async () => {
    const { middleware } = await import('@/middleware');

    const request = new NextRequest('https://admin.example.com/dashboard');
    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('redirects to /auth/login when session cookie value is empty', async () => {
    const { middleware } = await import('@/middleware');

    const request = new NextRequest('https://admin.example.com/dashboard', {
      headers: {
        cookie: 'medical-crm-admin-session=',
      },
    });

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('uses the correct cookie name: medical-crm-admin-session', async () => {
    const { middleware } = await import('@/middleware');

    // Wrong cookie name — should still redirect because admin cookie is absent
    const requestWrongCookie = new NextRequest('https://admin.example.com/dashboard', {
      headers: {
        cookie: 'medical-crm-hospital-session=some-value',
      },
    });

    const response = middleware(requestWrongCookie);
    expect(response.status).toBe(307);
  });
});
