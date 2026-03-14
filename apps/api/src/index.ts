import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError, mapErrorToStatus } from '@medical-crm/utils';
import { applySecurityMiddleware, perUserRateLimiter } from './middleware/security';
import { authMiddleware } from '@medical-crm/infrastructure/auth';

const app = new Hono();

// Apply security middleware stack (runs before auth)
applySecurityMiddleware(app);

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', version: '2.0.0' }));

// All /api/v2/* routes require auth + per-user rate limiting
app.use('/api/v2/*', authMiddleware, perUserRateLimiter);

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof DomainError) {
    const status = mapErrorToStatus(err.code);
    return c.json({ error: err.message, code: err.code }, status as any);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
