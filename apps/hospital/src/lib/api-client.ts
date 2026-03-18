// apps/hospital/src/lib/api-client.ts
// import 'server-only'; // uncomment after installing: pnpm --filter @medical-crm/hospital add server-only
import { redirect } from 'next/navigation';
import { apiFetch } from './api-fetch';
import { ApiError } from './errors';

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
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

  if (res.status === 401) {
    redirect('/auth/login');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}
