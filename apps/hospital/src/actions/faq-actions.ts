'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function createFaqItem(data: Record<string, unknown>) {
  const result = await apiClient('/api/v2/chatbot/faqs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/faq');
  return result;
}

export async function updateFaqItem(id: string, data: Record<string, unknown>) {
  const result = await apiClient(`/api/v2/chatbot/faqs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/faq');
  return result;
}

export async function deleteFaqItem(id: string) {
  await apiClient(`/api/v2/chatbot/faqs/${id}`, {
    method: 'DELETE',
  });
  revalidatePath('/faq');
}
