'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function createEmailTemplate(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/email-templates`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/email-templates');
  return result;
}

export async function updateEmailTemplate(id: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/email-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  revalidatePath('/email-templates');
  return result;
}

export async function deleteEmailTemplate(id: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  await apiClient(`/api/v2/email-templates/${id}`, {
    method: 'DELETE',
  });
  revalidatePath('/email-templates');
}
