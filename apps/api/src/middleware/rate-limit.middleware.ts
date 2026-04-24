import type { MiddlewareHandler } from 'hono';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitOptions {
  shouldBypass?: (c: Parameters<MiddlewareHandler>[0]) => boolean;
  onBypass?: (c: Parameters<MiddlewareHandler>[0], key: string) => void;
}

const CLEANUP_INTERVAL = 100;

function cleanupExpiredEntries(map: Map<string, { count: number; resetAt: number }>, now: number): void {
  for (const [key, entry] of map) {
    if (now > entry.resetAt) {
      map.delete(key);
    }
  }
}

function createLimiter(
  config: RateLimitConfig,
  getKey: (c: Parameters<MiddlewareHandler>[0]) => string,
  options: RateLimitOptions = {},
): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let requestsSinceCleanup = 0;

  return async (c, next) => {
    requestsSinceCleanup += 1;
    const key = getKey(c).trim();

    if (options.shouldBypass?.(c)) {
      options.onBypass?.(c, key);
      await next();
      return;
    }

    const now = Date.now();
    if (requestsSinceCleanup % CLEANUP_INTERVAL === 0) {
      cleanupExpiredEntries(hits, now);
    }
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + config.windowMs });
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

export function rateLimitByIp(config: RateLimitConfig, options: RateLimitOptions = {}): MiddlewareHandler {
  return createLimiter(config, (c) =>
    c.req
      .header('x-forwarded-for')
      ?.split(',')
      .at(0)
      ?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown', options,
  );
}

export function rateLimitByKey(
  config: RateLimitConfig,
  getKey: (c: Parameters<MiddlewareHandler>[0]) => string | Promise<string>,
): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let requestsSinceCleanup = 0;

  return async (c, next) => {
    requestsSinceCleanup += 1;
    const rawKey = await getKey(c);
    const key = rawKey.trim().toLowerCase() || 'unknown';
    const now = Date.now();
    if (requestsSinceCleanup % CLEANUP_INTERVAL === 0) {
      cleanupExpiredEntries(hits, now);
    }
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + config.windowMs });
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
