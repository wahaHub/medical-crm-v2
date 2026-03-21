'use server';

import { apiFetch } from '@/lib/api-fetch';

export async function uploadFaqAttachment(
  faqId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number };
}> {
  const res = await apiFetch(`/api/v2/chatbot/faqs/${faqId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? 'Failed to initialize FAQ attachment upload');
  }

  return res.json();
}
