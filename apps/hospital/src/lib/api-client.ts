// apps/hospital/src/lib/api-client.ts
// import 'server-only'; // uncomment after installing: pnpm --filter @medical-crm/hospital add server-only
import { redirect } from 'next/navigation';
import { apiFetch } from './api-fetch';
import { ApiError } from './errors';

export type ApiClientOptions = {
  onUnauthorized?: 'redirect' | 'throw';
  debugLabel?: string;
};

const REDIRECTABLE_401_ERRORS = new Set([
  'Unauthorized',
  'Token refresh failed',
  'Invalid or expired token',
  'Missing or invalid Authorization header',
]);

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
  options?: ApiClientOptions,
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch (err) {
    // Network errors (ECONNREFUSED, ECONNRESET, timeouts) throw before we get a Response.
    // Wrap them as a 503 ApiError so callers can handle them uniformly.
    const message = err instanceof Error ? err.message : 'Network error';
    console.error(`[apiClient] fetch failed for ${path}:`, message);
    throw new ApiError(503, { error: `Service unavailable: ${message}` });
  }

  const errorBody = !res.ok ? await readResponseBody(res) : null;

  if (res.status === 401) {
    const authMode = options?.onUnauthorized ?? 'redirect';
    const shouldRedirect = authMode === 'redirect' && isRedirectableUnauthorized(errorBody);
    const label = options?.debugLabel ?? path;

    console.warn(`[apiClient] 401 from ${label}`, {
      path,
      authMode,
      shouldRedirect,
      body: errorBody,
    });

    if (shouldRedirect) {
      redirect('/auth/login');
    }

    throw new ApiError(401, errorBody ?? { error: 'Unauthorized' });
  }

  if (!res.ok) {
    console.error(`[apiClient] request failed for ${options?.debugLabel ?? path}:`, {
      path,
      status: res.status,
      body: errorBody,
    });
    throw new ApiError(res.status, errorBody ?? { error: 'Unknown error' });
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return (safeParseJson(text) ?? text) as T;
}

export function isUnauthorizedApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

async function readResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  return safeParseJson(text) ?? { error: text || 'Unknown error' };
}

function isRedirectableUnauthorized(body: unknown): boolean {
  const errorMessage =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error?: unknown }).error
      : undefined;

  return typeof errorMessage === 'string' && REDIRECTABLE_401_ERRORS.has(errorMessage);
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
