import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from 'hono-rate-limiter';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}

export function applySecurityMiddleware(app: Hono) {
  app.use('*', requestId());
  app.use('*', logger());
  app.use('*', cors({
    origin: [
      process.env.ADMIN_ORIGIN!,
      process.env.HOSPITAL_ORIGIN!,
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: true,
    maxAge: 86400,
  }));
  app.use('*', secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  }));
  app.use('*', rateLimiter({
    windowMs: 60_000,
    limit: 100,
    keyGenerator: getClientIp,
    standardHeaders: 'draft-7',
  }));
  app.use('/auth/*', rateLimiter({
    windowMs: 300_000,
    limit: 5,
    keyGenerator: getClientIp,
  }));
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));
}

export const perUserRateLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 200,
  keyGenerator: (c) => {
    const session = c.get('session') as { userId?: string } | undefined;
    return session?.userId ?? 'anonymous';
  },
});
