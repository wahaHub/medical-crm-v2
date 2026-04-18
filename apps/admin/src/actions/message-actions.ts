'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createConversation(data: {
  category: 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT';
  title?: string;
  hospitalId?: string;
  caseId?: string;
}) {
  const res = await apiFetch('/api/v2/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create conversation');
  }

  revalidatePath('/messages');
  return res.json();
}

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

export async function restoreConversationAi(conversationId: string) {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}`, {
    method: 'PUT',
    body: JSON.stringify({ assistantMode: 'AI_ACTIVE' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to restore Medora AI');
  }

  revalidatePath('/messages');
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

interface AttachmentInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}

export async function uploadMessageFile(
  conversationId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: AttachmentInput }> {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to initialize upload');
  }

  return res.json();
}

export async function sendMessageWithAttachments(
  conversationId: string,
  content: string,
  messageType: string,
  attachments: AttachmentInput[],
) {
  const res = await apiFetch(`/api/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, messageType, attachments }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to send message with attachments');
  }

  revalidatePath('/messages');
  revalidatePath('/cases');
  return res.json();
}
