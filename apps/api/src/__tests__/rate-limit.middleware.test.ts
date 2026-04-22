import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';

describe('rateLimitByIp', () => {
  it('allows requests under the limit', async () => {
    const app = new Hono();
    app.use('/*', rateLimitByIp({ maxRequests: 3, windowMs: 60_000 }));
    app.post('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('blocks requests over the limit', async () => {
    const app = new Hono();
    app.use('/*', rateLimitByIp({ maxRequests: 2, windowMs: 60_000 }));
    app.post('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { method: 'POST' });
    await app.request('/test', { method: 'POST' });
    const res = await app.request('/test', { method: 'POST' });
    expect(res.status).toBe(429);
  });

  it('allows explicit debug bypass when authorized', async () => {
    const app = new Hono();
    app.use('/*', rateLimitByIp(
      { maxRequests: 1, windowMs: 60_000 },
      { shouldBypass: (c) => c.req.header('x-debug-bypass-token') === 'debug-token' },
    ));
    app.post('/test', (c) => c.json({ ok: true }));

    await app.request('/test', { method: 'POST' });
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'x-debug-bypass-token': 'debug-token' },
    });

    expect(res.status).toBe(200);
  });
});
