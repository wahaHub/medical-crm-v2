'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function addHospitalToCase(caseId: string, hospitalId: string) {
  const res = await apiFetch(`/api/v2/cases/${caseId}/hospital-contacts`, {
    method: 'POST',
    body: JSON.stringify({ hospitalId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to add hospital');
  }
  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function sendHospitalContactReminder(contactId: string, caseId: string) {
  const res = await apiFetch(`/api/v2/hospital-contacts/${contactId}/remind`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to send reminder');
  }
  revalidatePath(`/cases/${caseId}`);
  return res.json();
}

export async function removeHospitalContact(contactId: string, caseId: string, reason?: string) {
  const res = await apiFetch(`/api/v2/hospital-contacts/${contactId}/remove`, {
    method: 'PATCH',
    body: JSON.stringify(reason ? { reason } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? 'Failed to remove hospital');
  }
  revalidatePath(`/cases/${caseId}`);
  return res.json();
}
