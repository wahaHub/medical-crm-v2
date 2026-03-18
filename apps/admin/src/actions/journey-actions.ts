'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function updateJourney(
  caseId: string,
  payload: {
    visa?: unknown;
    insurance?: unknown;
    accommodation?: unknown;
    transportation?: unknown;
    postCare?: unknown;
  },
) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/journey`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to update journey');
  }
  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function addMilestone(
  caseId: string,
  payload: {
    eventType: string;
    eventDate: string;
    note?: string;
    isVisibleToPatient?: boolean;
  },
) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/milestones`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to add milestone');
  }
  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function updateMilestone(
  caseId: string,
  milestoneId: string,
  payload: {
    eventType?: string;
    eventDate?: string;
    note?: string | null;
    isVisibleToPatient?: boolean;
  },
) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/milestones/${milestoneId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to update milestone');
  }
  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function deleteMilestone(caseId: string, milestoneId: string) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/milestones/${milestoneId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to delete milestone');
  }
  revalidatePath(`/cases/${caseId}`);
}
