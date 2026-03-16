// apps/hospital/src/lib/api-client.ts
// import 'server-only'; // uncomment after installing: pnpm --filter @medical-crm/hospital add server-only
import { redirect } from 'next/navigation';
import { apiFetch } from './api-fetch';
import { ApiError } from './errors';

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(path, init);

  if (res.status === 401) {
    redirect('/auth/login');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}
