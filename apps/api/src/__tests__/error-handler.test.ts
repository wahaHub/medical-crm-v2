import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError, NotFoundError, ForbiddenError, mapErrorToStatus } from '@medical-crm/utils';

function createTestApp() {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof DomainError) {
      const status = mapErrorToStatus(err.code);
      return c.json({ error: err.message, code: err.code }, status as any);
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
    const body = await res.json();
    expect(body.error).toBe('Invalid data');
  });

  it('maps NotFoundError to 404', async () => {
    const app = createTestApp();
    app.get('/throw-notfound', () => {
      throw new NotFoundError('Hospital not found');
    });

    const res = await app.request('/throw-notfound');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Hospital not found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('maps ForbiddenError to 403', async () => {
    const app = createTestApp();
    app.get('/throw-forbidden', () => {
      throw new ForbiddenError('Not allowed');
    });

    const res = await app.request('/throw-forbidden');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('maps unhandled error to 500', async () => {
    const app = createTestApp();
    app.get('/throw-generic', () => {
      throw new Error('Something broke');
    });

    const res = await app.request('/throw-generic');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('mapErrorToStatus utility works end-to-end', () => {
    expect(mapErrorToStatus('NOT_FOUND')).toBe(404);
    expect(mapErrorToStatus('FORBIDDEN')).toBe(403);
    expect(mapErrorToStatus('SOMETHING_ELSE')).toBe(500);
  });
});
