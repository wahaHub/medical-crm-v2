import type { MiddlewareHandler } from 'hono';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function rateLimitByIp(config: RateLimitConfig): MiddlewareHandler {
  const ipHits = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for') ??
      c.req.header('x-real-ip') ??
      'unknown';
    const now = Date.now();
    const entry = ipHits.get(ip);

    if (!entry || now > entry.resetAt) {
      ipHits.set(ip, { count: 1, resetAt: now + config.windowMs });
      await next();
      return;
    }

    if (entry.count >= config.maxRequests) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    entry.count++;
    await next();
  };
}
