'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createCase(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create case');
  }

  revalidatePath('/cases');
  return res.json() as Promise<{ id: string }>;
}
