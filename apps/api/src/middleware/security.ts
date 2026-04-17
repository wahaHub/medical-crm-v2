import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from 'hono-rate-limiter';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';

// Extend Hono's ContextVariableMap to register the 'session' variable
declare module 'hono' {
  interface ContextVariableMap {
    session: { userId?: string } | undefined;
  }
}

/**
 * Extract client IP for rate limiting.
 *
 * IMPORTANT: In production, this server MUST sit behind a trusted reverse proxy
 * (e.g. nginx, Cloudflare, ALB) that overwrites x-forwarded-for. If the proxy
 * appends to the header instead, use the *rightmost* non-private IP:
 *   xff.split(',').map(s => s.trim()).filter(isPublic).at(-1)
 *
 * We take the rightmost entry (set by the last trusted proxy hop) rather than
 * the leftmost (which any client can spoof).  When there is only a single
 * trusted proxy layer, rightmost === the value the proxy wrote.
 *
 * If TRUSTED_PROXY_COUNT is set, we use it to pick the correct entry from
 * the right side of the x-forwarded-for chain.
 */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim());
    const trustedHops = Number(process.env.TRUSTED_PROXY_COUNT ?? '1');
    // Pick the entry written by the outermost trusted proxy
    const idx = Math.max(0, parts.length - trustedHops);
    const ip = parts[idx];
    return ip != null && ip.length > 0 ? ip : 'unknown';
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}

export function applySecurityMiddleware(app: Hono) {
  const allowedOrigins = [
    process.env.ADMIN_ORIGIN,
    process.env.HOSPITAL_ORIGIN,
    process.env.BEAUTY_ORIGIN,
    process.env.CHINA_ORIGIN,
  ].filter((origin): origin is string => Boolean(origin));

  app.use('*', requestId());
  app.use('*', logger());
  app.use('*', cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Medora-Site'],
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
    const session = c.get('session');
    return session?.userId ?? 'anonymous';
  },
});
