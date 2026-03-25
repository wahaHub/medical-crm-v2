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

export async function createTemplate(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/question-templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to create template'));
  }

  revalidatePath('/question-collectors');
  return res.json();
}

export async function updateTemplate(id: string, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/v2/question-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to update template'));
  }

  revalidatePath('/question-collectors');
  return res.json();
}

export async function deleteTemplate(id: string) {
  const res = await apiFetch(`/api/v2/question-templates/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to delete template'));
  }

  revalidatePath('/question-collectors');
}

export async function customizeQuestions(templateId: string, customizedQuestions: unknown) {
  const res = await apiFetch(`/api/v2/question-templates/${templateId}/customizations`, {
    method: 'POST',
    body: JSON.stringify({ customizedQuestions }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to customize questions'));
  }

  revalidatePath('/question-collectors');
  return res.json();
}
