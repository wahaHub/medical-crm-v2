'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

export async function createConsultation(data: {
  caseId: string;
  scheduledAt: string;
  durationMinutes?: number;
  notes?: string;
}) {
  const result = await apiClient('/api/v2/consultations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/consultations');
  revalidatePath('/dashboard');
  return result;
}

export async function updateConsultationStatus(id: string, action: string) {
  const result = await apiClient(`/api/v2/consultations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  revalidatePath('/consultations');
  revalidatePath('/dashboard');
  return result;
}
