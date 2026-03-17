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

interface AttachmentInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}

/**
 * Send a message with file attachments and a specific messageType (IMAGE or FILE).
 * The backend will enqueue AI summarization and translation for non-TEXT types.
 */
export async function sendMessageWithAttachments(
  conversationId: string,
  content: string,
  messageType: string,
  attachments: AttachmentInput[],
) {
  const result = await apiClient(`/api/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      messageType,
      attachments,
    }),
  });
  revalidatePath('/messages');
  return result;
}

/**
 * Upload a message attachment and return the backend attachment payload.
 */
export async function uploadFile(
  conversationId: string,
  file: File,
): Promise<AttachmentInput> {
  const init = await apiClient<{
    upload: {
      uploadUrl: string;
      storageKey: string;
    };
    attachment: AttachmentInput;
  }>(`/api/v2/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    }),
  });

  const uploadRes = await fetch(init.upload.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed with status ${uploadRes.status}`);
  }

  return init.attachment;
}

export async function createConversation(data: { caseId: string; category: string }) {
  const result = await apiClient('/api/v2/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/messages');
  return result;
}
