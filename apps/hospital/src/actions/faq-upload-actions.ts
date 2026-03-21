'use server';

import { apiClient } from '@/lib/api-client';

export async function uploadFaqAttachment(
  faqId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number };
}> {
  return apiClient(`/api/v2/chatbot/faqs/${faqId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
