'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function updateCaseStatus(id: string, status: string) {
  const result = await apiClient(`/api/v2/cases/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/cases');
  revalidatePath('/dashboard');
  return result;
}

export async function updateCaseStage(id: string, stage: string) {
  const result = await apiClient(`/api/v2/cases/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stage }),
  });
  revalidatePath(`/cases/${id}`);
  return result;
}
