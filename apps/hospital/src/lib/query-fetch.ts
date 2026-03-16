import { ApiError } from './errors';

/** Fetch helper for client-side Route Handler queries. Throws ApiError on non-ok. */
export async function queryFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }
  return res.json();
}
