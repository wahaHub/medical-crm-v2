'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createCase(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create case');
  }

  revalidatePath('/cases');
  return res.json() as Promise<{ id: string }>;
}

export async function updateCaseStatus(caseId: string, status: string) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ assignmentStatus: status }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update case status');
  }

  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function updateCaseStage(caseId: string, stage: string) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ treatmentStage: stage }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update case stage');
  }

  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function addCaseNote(
  caseId: string,
  input: {
    note?: string;
    attachmentNames?: string[];
    documentIds?: string[];
  },
) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/progress`, {
    method: 'POST',
    body: JSON.stringify({ type: 'NOTE', ...input }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to add case note');
  }

  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function initCaseDocumentUpload(
  caseId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number };
  documentId: string;
}> {
  const res = await apiFetch(`/api/v2/cases/${caseId}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      documentType: 'OTHER',
      sensitivity: 'PHI_HIGH',
      language: 'en',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to initialize document upload');
  }

  return res.json();
}

export async function deleteDocument(caseId: string, docId: string) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/documents/${docId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to delete document');
  }

  revalidatePath(`/cases/${caseId}`);
}
