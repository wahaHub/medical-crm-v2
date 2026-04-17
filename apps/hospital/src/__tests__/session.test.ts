import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Session state — simulates the cookie store
// ---------------------------------------------------------------------------
let sessionData: Record<string, unknown> | null = null;
let adminSessionData: Record<string, unknown> | null = null;

const mockGetSession = vi.fn(() => Promise.resolve(sessionData));
const mockSaveSession = vi.fn((data: Record<string, unknown>) => {
  sessionData = data;
  return Promise.resolve();
});
const mockClearSession = vi.fn(() => {
  sessionData = null;
  return Promise.resolve();
});
const mockAdminSessionSave = vi.fn(async () => undefined);

// ---------------------------------------------------------------------------
// Mock session module
// ---------------------------------------------------------------------------
vi.mock('@/lib/session', () => ({
  getSession: () => mockGetSession(),
  saveSession: (data: Record<string, unknown>) => mockSaveSession(data),
  clearSession: () => mockClearSession(),
}));

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(async () => ({
    get access_token() { return adminSessionData?.access_token as string | undefined; },
    set access_token(value: string | undefined) {
      adminSessionData = { ...(adminSessionData ?? {}), access_token: value };
    },
    get refresh_token() { return adminSessionData?.refresh_token as string | undefined; },
    set refresh_token(value: string | undefined) {
      adminSessionData = { ...(adminSessionData ?? {}), refresh_token: value };
    },
    get id_token() { return adminSessionData?.id_token as string | undefined; },
    set id_token(value: string | undefined) {
      adminSessionData = { ...(adminSessionData ?? {}), id_token: value };
    },
    get expires_at() { return adminSessionData?.expires_at as number | undefined; },
    set expires_at(value: number | undefined) {
      adminSessionData = { ...(adminSessionData ?? {}), expires_at: value };
    },
    get code_verifier() { return adminSessionData?.code_verifier as string | undefined; },
    set code_verifier(value: string | undefined) {
      adminSessionData = { ...(adminSessionData ?? {}), code_verifier: value };
    },
    save: mockAdminSessionSave,
  })),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(new Map())),
}));

// Mock next/navigation
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
  KEYCLOAK_CLIENT_ID: 'hospital-client',
  KEYCLOAK_CLIENT_SECRET: 'super-secret',
  HOSPITAL_ORIGIN: 'https://hospital.example.com',
  API_URL: 'http://localhost:3001',
};

function setSession(data: Record<string, unknown> | null) {
  sessionData = data;
}

// ---------------------------------------------------------------------------
// Login API route tests (password grant)
// ---------------------------------------------------------------------------
describe('hospital auth — login API route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSaveSession.mockClear();
    mockClearSession.mockClear();
    mockAdminSessionSave.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    setSession(null);
    adminSessionData = null;
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeLoginRequest(body: Record<string, string>) {
    return new NextRequest('https://hospital.example.com/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns 400 when username or password is missing', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeLoginRequest({ username: '', password: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when Keycloak rejects credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error_description: 'Invalid user credentials' }), { status: 401 }),
    );

    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeLoginRequest({ username: 'bad', password: 'bad' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid credentials');
  });

  it('sets the hospital session cookie on successful hospital login', async () => {
    const payload = { sub: 'user-1', email: 'test@hospital.com', realm_access: { roles: ['hospital'] }, hospital_id: 'h-1' };
    const fakeJwt = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        access_token: fakeJwt,
        refresh_token: 'refresh-xyz',
        id_token: 'id-tok-123',
        expires_in: 300,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeLoginRequest({ username: 'test', password: 'pass' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe('test@hospital.com');
    expect(res.headers.get('set-cookie')).toContain('medical-crm-hospital-session=');
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('accepts admin accounts and redirects to admin origin', async () => {
    const payload = { sub: 'admin-1', email: 'admin@test.com', realm_access: { roles: ['admin'] } };
    const fakeJwt = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
    adminSessionData = {
      id_token: 'stale-admin-id',
      code_verifier: 'stale-code-verifier',
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        access_token: fakeJwt,
        refresh_token: 'admin-refresh',
        id_token: 'admin-id',
        expires_in: 300,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    process.env.ADMIN_ORIGIN = 'https://admin.example.com';

    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeLoginRequest({ username: 'admin', password: 'pass' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.redirectTo).toBe('https://admin.example.com');
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockAdminSessionSave).toHaveBeenCalledOnce();
    expect(adminSessionData?.access_token).toBe(fakeJwt);
    expect(adminSessionData?.id_token).toBeUndefined();
    expect(adminSessionData?.code_verifier).toBeUndefined();
  });

  it('sends password grant to Keycloak token endpoint', async () => {
    const payload = { sub: 'u-1', email: 'e@test.com', realm_access: { roles: ['hospital'] } };
    const fakeJwt = `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: fakeJwt, refresh_token: 'r', id_token: 'i', expires_in: 300 }), { status: 200 }),
    );

    const { POST } = await import('@/app/api/auth/login/route');
    await POST(makeLoginRequest({ username: 'myuser', password: 'mypass' }));

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENV.KEYCLOAK_ISSUER}/protocol/openid-connect/token`);

    const body = new URLSearchParams(options.body as string);
    expect(body.get('grant_type')).toBe('password');
    expect(body.get('username')).toBe('myuser');
    expect(body.get('password')).toBe('mypass');
    expect(body.get('client_id')).toBe(ENV.KEYCLOAK_CLIENT_ID);
  });
});

// ---------------------------------------------------------------------------
// Logout route tests
// ---------------------------------------------------------------------------
describe('hospital auth — logout route', () => {
  beforeEach(() => {
    vi.resetModules();
    mockClearSession.mockClear();
    setSession(null);
    Object.assign(process.env, ENV);
  });

  it('redirects to Keycloak end-session endpoint', async () => {
    setSession({ id_token: 'my-id-token' });
    const { GET } = await import('@/app/auth/logout/route');
    const response = await GET();

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(location).toContain(`${ENV.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`);
  });

  it('includes id_token_hint when id_token is in session', async () => {
    setSession({ id_token: 'my-id-token' });
    const { GET } = await import('@/app/auth/logout/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    const url = new URL(location);
    expect(url.searchParams.get('id_token_hint')).toBe('my-id-token');
    expect(url.searchParams.get('client_id')).toBe(ENV.KEYCLOAK_CLIENT_ID);
  });

  it('omits id_token_hint when no id_token in session', async () => {
    setSession({});
    const { GET } = await import('@/app/auth/logout/route');
    const response = await GET();

    const location = response.headers.get('location')!;
    const url = new URL(location);
    expect(url.searchParams.has('id_token_hint')).toBe(false);
  });

  it('calls clearSession()', async () => {
    setSession({ id_token: 'my-id-token' });
    const { GET } = await import('@/app/auth/logout/route');
    await GET();
    expect(mockClearSession).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// API client tests
// ---------------------------------------------------------------------------
describe('hospital api-client', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSaveSession.mockClear();
    mockClearSession.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    setSession(null);
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws redirect to /auth/login when there is no session', async () => {
    setSession(null);
    const { apiClient } = await import('@/lib/api-client');
    await expect(apiClient('/api/test')).rejects.toThrow('REDIRECT:/auth/login');
  });

  it('includes Bearer token in Authorization header', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    setSession({ access_token: 'my-bearer-token', refresh_token: 'r', expires_at: futureExpiry });
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
    setSession({ access_token: 'my-bearer-token', refresh_token: 'r', expires_at: futureExpiry });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const { apiClient } = await import('@/lib/api-client');
    await apiClient('/api/patients');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENV.API_URL}/api/patients`);
  });

  it('refreshes token when within 60 seconds of expiry', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    setSession({
      access_token: 'old-access-token',
      refresh_token: 'my-refresh-token',
      expires_at: nearExpiry,
    });

    const refreshResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      id_token: 'new-id-token',
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
    setSession({ access_token: 'valid-token', refresh_token: 'r', expires_at: farExpiry });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const { apiClient } = await import('@/lib/api-client');
    await apiClient('/api/data');

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENV.API_URL}/api/data`);
  });

  it('redirects to /auth/login when refresh fails', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    setSession({
      access_token: 'old-token',
      refresh_token: 'bad-refresh-token',
      expires_at: nearExpiry,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const { apiClient } = await import('@/lib/api-client');
    await expect(apiClient('/api/data')).rejects.toThrow('REDIRECT:/auth/login');
    // clearSession is not called because cookie mutation is not allowed in Server Component context.
    // apiFetch returns a 401 Response instead, and apiClient handles the redirect.
  });

  it('redirects to /auth/login when refresh fetch throws', async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30;
    setSession({
      access_token: 'old-token',
      refresh_token: 'bad-refresh-token',
      expires_at: nearExpiry,
    });

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { apiClient } = await import('@/lib/api-client');
    await expect(apiClient('/api/data')).rejects.toThrow('REDIRECT:/auth/login');
    // clearSession is not called because cookie mutation is not allowed in Server Component context.
    // apiFetch returns a 401 Response instead, and apiClient handles the redirect.
  });
});

// ---------------------------------------------------------------------------
// Middleware tests
// ---------------------------------------------------------------------------
describe('hospital middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns NextResponse.next() when the hospital session cookie is present', async () => {
    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://hospital.example.com/dashboard', {
      headers: { cookie: 'medical-crm-hospital-session=some-value' },
    });
    const response = middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects to /auth/login when no session cookie is present', async () => {
    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://hospital.example.com/dashboard');
    const response = middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('redirects to /auth/login when session cookie value is empty', async () => {
    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://hospital.example.com/dashboard', {
      headers: { cookie: 'medical-crm-hospital-session=' },
    });
    const response = middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
  });

  it('uses the correct cookie name: medical-crm-hospital-session', async () => {
    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://hospital.example.com/dashboard', {
      headers: { cookie: 'medical-crm-admin-session=some-value' },
    });
    const response = middleware(request);
    expect(response.status).toBe(307);
  });

  it('does not redirect public assets like the login logo', async () => {
    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://hospital.example.com/medora_logo.png');
    const response = middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
