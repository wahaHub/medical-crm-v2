'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function createQuote(data: {
  caseId: string;
  totalAmount: string;
  currency?: string;
  lineItems?: Array<{ name: string; amount: string }>;
  notes?: string;
  validUntil?: string;
}) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient('/api/v2/quotes', {
    method: 'POST',
    body: JSON.stringify({ ...data, hospitalId }),
  });
  revalidatePath('/cases');
  return result;
}

export async function sendQuote(quoteId: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/quotes/${quoteId}/send`, {
    method: 'POST',
  });
  revalidatePath('/cases');
  return result;
}

export async function updateQuote(quoteId: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient(`/api/v2/quotes/${quoteId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/cases');
  return result;
}
