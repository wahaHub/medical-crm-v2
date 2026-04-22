import { readUploadError, uploadToSignedUrl } from '@/lib/direct-upload';

async function localApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    let error = 'Request failed';
    try {
      const parsed = JSON.parse(text) as { error?: string };
      error = parsed.error ?? text ?? error;
    } catch {
      error = text || error;
    }
    throw new Error(error);
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function sendMessage(conversationId: string, content: string) {
  return localApiRequest(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
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
  return localApiRequest(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      messageType,
      attachments,
    }),
  });
}

/**
 * Upload a message attachment and return the backend attachment payload.
 */
export async function uploadFile(
  conversationId: string,
  file: File,
): Promise<AttachmentInput> {
  const init = await localApiRequest<{
    upload: {
      uploadUrl: string;
      storageKey: string;
    };
    asset?: AttachmentInput;
    attachment?: AttachmentInput;
  }>(`/api/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    }),
  });

  const uploadRes = await uploadToSignedUrl(init.upload.uploadUrl, file);

  if (!uploadRes.ok) {
    throw new Error(await readUploadError(uploadRes, file.name));
  }

  const attachment = init.asset ?? init.attachment;
  if (!attachment) {
    throw new Error('Upload initialized successfully but no attachment payload was returned');
  }

  return attachment;
}

export async function createConversation(data: { category: string; caseId?: string }) {
  return localApiRequest('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
