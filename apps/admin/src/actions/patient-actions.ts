'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';
import type { PatientMergeResult } from '@/lib/api-types';

// Case Lifecycle Phase 2: patient merge (dry-run preview + irreversible execute)
export async function previewPatientMerge(
  secondaryPatientId: string,
  input: { primaryPatientId: string },
): Promise<PatientMergeResult> {
  const res = await apiFetch(`/api/v2/patients/${secondaryPatientId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ ...input, dryRun: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to preview patient merge');
  }

  return res.json() as Promise<PatientMergeResult>;
}

export async function mergePatient(
  secondaryPatientId: string,
  input: { primaryPatientId: string },
): Promise<PatientMergeResult> {
  const res = await apiFetch(`/api/v2/patients/${secondaryPatientId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ ...input, dryRun: false }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'Failed to merge patients');
  }

  revalidatePath('/cases');
  revalidatePath('/lifecycle');
  return res.json() as Promise<PatientMergeResult>;
}
