'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function updateHospitalInfo(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/info`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function createProcedure(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/procedures`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function updateProcedure(id: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/procedures/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function deleteProcedure(id: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  await apiClient(`/api/v2/hospitals/${hospitalId}/materials/procedures/${id}`, {
    method: 'DELETE',
  });
  revalidatePath('/materials');
}

export async function createSurgeon(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/surgeons`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function updateSurgeon(id: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/surgeons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function deleteSurgeon(id: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  await apiClient(`/api/v2/hospitals/${hospitalId}/materials/surgeons/${id}`, {
    method: 'DELETE',
  });
  revalidatePath('/materials');
}

export async function createBeforeAfterCase(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/cases`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function updateBeforeAfterCase(id: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/cases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  revalidatePath('/materials');
  return result;
}

export async function deleteBeforeAfterCase(id: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  await apiClient(`/api/v2/hospitals/${hospitalId}/materials/cases/${id}`, {
    method: 'DELETE',
  });
  revalidatePath('/materials');
}
