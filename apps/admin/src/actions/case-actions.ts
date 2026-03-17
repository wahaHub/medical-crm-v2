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
    body: JSON.stringify({ status }),
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
    body: JSON.stringify({ stage }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update case stage');
  }

  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function uploadDocument(caseId: string, formData: FormData) {
  const session = await import('@/lib/session').then((m) => m.getSession());
  if (!session?.access_token) {
    throw new Error('Unauthorized');
  }

  const API_URL = process.env.API_URL ?? 'http://localhost:3001';
  const res = await fetch(`${API_URL}/api/v2/cases/${caseId}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to upload document');
  }

  revalidatePath(`/cases/${caseId}`);
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
