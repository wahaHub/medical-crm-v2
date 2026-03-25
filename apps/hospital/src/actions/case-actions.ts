'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';

function trimToUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function updateCaseStatus(id: string, assignmentStatus: string) {
  const result = await apiClient(`/api/v2/cases/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ assignmentStatus }),
  });
  revalidatePath('/cases');
  revalidatePath('/dashboard');
  return result;
}

export async function updateCaseStage(id: string, treatmentStage: string) {
  const result = await apiClient(`/api/v2/cases/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ treatmentStage }),
  });
  revalidatePath(`/cases/${id}`);
  return result;
}

export async function addDiagnosis(
  id: string,
  data: {
    title: string;
    diagnosisType?: string;
    icdCode?: string;
    severity?: string;
    description?: string;
    treatmentRecommendation?: string;
    suggestedTests?: string;
    costEstimate?: string;
    treatmentDuration?: string;
  },
) {
  const title = trimToUndefined(data.title);
  if (!title) throw new Error('Diagnosis name is required');

  const icdCode = trimToUndefined(data.icdCode);

  await apiClient(`/api/v2/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      primaryDiagnosis: title,
      diagnosisCode: icdCode,
    }),
  });

  const result = await apiClient(`/api/v2/cases/${id}/progress`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'DIAGNOSIS',
      title,
      description: trimToUndefined(data.description),
      diagnosisType: trimToUndefined(data.diagnosisType),
      icdCode,
      severity: trimToUndefined(data.severity),
      treatmentRecommendation: trimToUndefined(data.treatmentRecommendation),
      suggestedTests: trimToUndefined(data.suggestedTests),
      costEstimate: trimToUndefined(data.costEstimate),
      treatmentDuration: trimToUndefined(data.treatmentDuration),
    }),
  });

  revalidatePath('/cases');
  revalidatePath(`/cases/${id}`);
  return result;
}
