'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-fetch';

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  return body.error ?? body.message ?? fallback;
}

export async function createGuide(payload: Record<string, unknown>) {
  const response = await apiFetch('/api/v2/guides', { method: 'POST', body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(await readError(response, 'Unable to create guide'));
  revalidatePath('/guides');
  return response.json();
}

export async function updateGuide(id: string, payload: Record<string, unknown>) {
  const response = await apiFetch(`/api/v2/guides/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(await readError(response, 'Unable to update guide'));
  revalidatePath('/guides');
  revalidatePath(`/guides/${id}`);
  return response.json();
}

export async function deleteGuide(id: string) {
  const response = await apiFetch(`/api/v2/guides/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await readError(response, 'Unable to delete guide'));
  revalidatePath('/guides');
}

export async function generateGuideTakeaways(payload: { title: string; contentDocument: unknown }) {
  const response = await apiFetch('/api/v2/guides/key-takeaways', { method: 'POST', body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(await readError(response, 'Unable to generate key takeaways'));
  return response.json() as Promise<{ takeaways: string[] }>;
}
