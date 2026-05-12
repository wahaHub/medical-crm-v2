import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = {
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
  HOSPITAL_ORIGIN: process.env.HOSPITAL_ORIGIN,
  BEAUTY_ORIGIN: process.env.BEAUTY_ORIGIN,
  CHINA_ORIGIN: process.env.CHINA_ORIGIN,
};

describe('Security middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv.ADMIN_ORIGIN === undefined) {
      delete process.env.ADMIN_ORIGIN;
    } else {
      process.env.ADMIN_ORIGIN = originalEnv.ADMIN_ORIGIN;
    }

    if (originalEnv.HOSPITAL_ORIGIN === undefined) {
      delete process.env.HOSPITAL_ORIGIN;
    } else {
      process.env.HOSPITAL_ORIGIN = originalEnv.HOSPITAL_ORIGIN;
    }

    if (originalEnv.BEAUTY_ORIGIN === undefined) {
      delete process.env.BEAUTY_ORIGIN;
    } else {
      process.env.BEAUTY_ORIGIN = originalEnv.BEAUTY_ORIGIN;
    }

    if (originalEnv.CHINA_ORIGIN === undefined) {
      delete process.env.CHINA_ORIGIN;
    } else {
      process.env.CHINA_ORIGIN = originalEnv.CHINA_ORIGIN;
    }
  });
  it('returns security headers', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects CORS from unknown origin', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accepts CORS from allowed origin', async () => {
    process.env.ADMIN_ORIGIN = 'http://localhost:3002';
    process.env.HOSPITAL_ORIGIN = 'http://localhost:3003';

    const { Hono } = await import('hono');
    const { applySecurityMiddleware } = await import('../middleware/security');
    const testApp = new Hono();
    applySecurityMiddleware(testApp);
    testApp.get('/health', (c) => c.json({ ok: true }));

    const res = await testApp.request('/health', {
      headers: { Origin: 'http://localhost:3002' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3002');
  });

  it('accepts CORS from beauty origin', async () => {
    process.env.BEAUTY_ORIGIN = 'https://beauty.medora.com';

    const { Hono } = await import('hono');
    const { applySecurityMiddleware } = await import('../middleware/security');
    const testApp = new Hono();
    applySecurityMiddleware(testApp);
    testApp.get('/health', (c) => c.json({ ok: true }));

    const res = await testApp.request('/health', {
      headers: { Origin: 'https://beauty.medora.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://beauty.medora.com');
  });

  it('allows x-medora-site in CORS preflight headers', async () => {
    process.env.ADMIN_ORIGIN = 'https://portal.medora.com';
    process.env.HOSPITAL_ORIGIN = 'https://hospital.medora.com';
    process.env.CHINA_ORIGIN = 'https://china.medora.com';

    const { Hono } = await import('hono');
    const { applySecurityMiddleware } = await import('../middleware/security');
    const testApp = new Hono();
    applySecurityMiddleware(testApp);
    testApp.get('/health', (c) => c.json({ ok: true }));

    const res = await testApp.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://portal.medora.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-medora-site',
      },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('https://portal.medora.com');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-medora-site');
  });
  it('includes request-id header', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns 404 for unknown routes', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('preserves downstream errors through rate limiting middleware', async () => {
    const { Hono } = await import('hono');
    const { applySecurityMiddleware } = await import('../middleware/security');
    const testApp = new Hono();
    applySecurityMiddleware(testApp);
    testApp.get('/boom', () => {
      throw new Error('downstream failure');
    });
    testApp.onError((err, c) => c.json({ error: err.message }, 500));

    const res = await testApp.request('/boom');
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'downstream failure' });
  });
});
