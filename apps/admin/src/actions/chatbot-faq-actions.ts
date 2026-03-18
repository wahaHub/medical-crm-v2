'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createFaq(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/chatbot/faqs', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create FAQ');
  }

  revalidatePath('/chatbot');
  return res.json();
}

export async function updateFaq(id: string, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/v2/chatbot/faqs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update FAQ');
  }

  revalidatePath('/chatbot');
  return res.json();
}

export async function deleteFaq(id: string) {
  const res = await apiFetch(`/api/v2/chatbot/faqs/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to delete FAQ');
  }

  revalidatePath('/chatbot');
}
