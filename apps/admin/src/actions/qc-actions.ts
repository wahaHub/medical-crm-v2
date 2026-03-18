'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createTemplate(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/question-templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create template');
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
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update template');
  }

  revalidatePath('/question-collectors');
  return res.json();
}

export async function customizeQuestions(templateId: string, customizedQuestions: unknown) {
  const res = await apiFetch(`/api/v2/question-templates/${templateId}/customizations`, {
    method: 'POST',
    body: JSON.stringify({ customizedQuestions }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to customize questions');
  }

  revalidatePath('/question-collectors');
  return res.json();
}
