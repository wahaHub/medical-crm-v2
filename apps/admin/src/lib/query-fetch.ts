import { ApiError } from './errors';

/** Fetch helper for client-side Route Handler queries. Throws ApiError on non-ok. */
export async function queryFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

/** Fetch helper for client-side Route Handler mutations. Throws ApiError on non-ok. */
export async function mutationFetch<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, responseBody);
  }
  return res.json() as Promise<T>;
}
