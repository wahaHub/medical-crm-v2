'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';
import type { CaseMergeResult } from '@/lib/api-types';

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

// Case Lifecycle Phase 1: manual case creation (offline channels)
export async function createManualCase(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/cases/manual', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to create case');
  }

  revalidatePath('/cases');
  revalidatePath('/lifecycle');
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
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to update case stage');
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/lifecycle');
  return res.json();
}

// Case Lifecycle Phase 1: admin note recorded as an ADMIN_NOTE case event
export async function addCaseTimelineNote(caseId: string, note: string) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to add case note');
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
  params: { fileName: string; fileSize: number; mimeType: string; stageTag?: string },
): Promise<{
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number };
  documentId: string;
}> {
  const { stageTag, ...fileParams } = params;
  const res = await apiFetch(`/api/v2/cases/${caseId}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      ...fileParams,
      documentType: 'OTHER',
      sensitivity: 'PHI_HIGH',
      language: 'en',
      ...(stageTag ? { stageTag } : {}),
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

// Case Lifecycle Phase 2: case merge (dry-run preview + irreversible execute)
export async function previewCaseMerge(
  secondaryCaseId: string,
  input: { primaryCaseId: string },
): Promise<CaseMergeResult> {
  const res = await apiFetch(`/api/v2/cases/${secondaryCaseId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ ...input, dryRun: true, confirmDifferentPatients: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to preview case merge');
  }

  return res.json() as Promise<CaseMergeResult>;
}

export async function mergeCase(
  secondaryCaseId: string,
  input: { primaryCaseId: string; confirmDifferentPatients?: boolean },
): Promise<CaseMergeResult> {
  const res = await apiFetch(`/api/v2/cases/${secondaryCaseId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ ...input, dryRun: false }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to merge cases');
  }

  revalidatePath(`/cases/${secondaryCaseId}`);
  revalidatePath(`/cases/${input.primaryCaseId}`);
  revalidatePath('/cases');
  revalidatePath('/lifecycle');
  return res.json() as Promise<CaseMergeResult>;
}
