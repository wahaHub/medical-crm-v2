'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function sendMessage(conversationId: string, content: string) {
  const result = await apiClient(`/api/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  revalidatePath('/messages');
  return result;
}

export async function createConversation(data: { caseId: string; category: string }) {
  const result = await apiClient('/api/v2/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/messages');
  return result;
}
