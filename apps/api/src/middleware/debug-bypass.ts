import type { Context } from 'hono';

const DEBUG_BYPASS_HEADER = 'x-debug-bypass-token';

export function isDebugBypassAuthorized(c: Context): boolean {
  if (process.env.DEBUG_BYPASS_ENABLED !== 'true') {
    return false;
  }

  const configuredToken = process.env.DEBUG_BYPASS_TOKEN?.trim();
  if (!configuredToken) {
    return false;
  }

  const requestToken = c.req.header(DEBUG_BYPASS_HEADER)?.trim();
  if (!requestToken) {
    return false;
  }

  return requestToken === configuredToken;
}

export function getDebugBypassHeaderName(): string {
  return DEBUG_BYPASS_HEADER;
}
