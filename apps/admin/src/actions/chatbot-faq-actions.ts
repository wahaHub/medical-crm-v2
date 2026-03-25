'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

async function readErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const payload = await res.json().catch(() => ({})) as {
    message?: string;
    error?: string;
    code?: string;
  };
  return payload.message ?? payload.error ?? payload.code ?? fallback;
}

export async function createFaq(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/chatbot/faqs', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to create FAQ'));
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
    throw new Error(await readErrorMessage(res, 'Failed to update FAQ'));
  }

  revalidatePath('/chatbot');
  return res.json();
}

export async function deleteFaq(id: string) {
  const res = await apiFetch(`/api/v2/chatbot/faqs/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to delete FAQ'));
  }

  revalidatePath('/chatbot');
}

export async function createFaqCategory(data: {
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  sortOrder?: number;
  isActive?: boolean;
}) {
  const res = await apiFetch('/api/v2/chatbot/faqs/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to create FAQ category'));
  }

  revalidatePath('/chatbot');
  return res.json();
}

export async function deleteFaqCategory(id: string) {
  const res = await apiFetch(`/api/v2/chatbot/faqs/categories/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to delete FAQ category'));
  }

  revalidatePath('/chatbot');
}
