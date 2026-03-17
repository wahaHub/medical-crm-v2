'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function sendMessage(conversationId: string, content: string) {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, messageType: 'TEXT' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to send message');
  }

  revalidatePath('/cases');
  return res.json();
}

export async function approveMessage(messageId: string) {
  const res = await apiFetch(`/api/v2/messages/${messageId}/approve`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to approve message');
  }

  return res.json();
}

export async function rejectMessage(messageId: string) {
  const res = await apiFetch(`/api/v2/messages/${messageId}/reject`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to reject message');
  }

  return res.json();
}
