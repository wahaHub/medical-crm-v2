'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import {
  buildUploadDebugPayload,
  formatUploadDebugError,
  MATERIALS_UPLOAD_DEBUG_PREFIX,
} from '@/lib/materials-upload-debug';
import { getSessionHospitalId } from '@/lib/session-helpers';

const MATERIALS_DEBUG_PREFIX = '[hospital.materials.debug]';

function summarizeArrayField(items: unknown, options: { keys?: string[] } = {}) {
  if (!Array.isArray(items)) {
    return { type: typeof items };
  }

  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { index, type: typeof item };
    }

    const record = item as Record<string, unknown>;
    const summary: Record<string, unknown> = { index };
    const keys = options.keys ?? Object.keys(record);

    for (const key of keys) {
      const value = record[key];
      summary[key] = typeof value === 'string'
        ? {
            present: value.length > 0,
            length: value.length,
            preview: value.slice(0, 80),
          }
        : value === undefined
          ? 'undefined'
          : value === null
            ? 'null'
            : value;
    }

    return summary;
  });
}

function summarizeMaterialsInfoPayload(data: Record<string, unknown>) {
  return {
    keys: Object.keys(data).sort(),
    videoTestimonials: summarizeArrayField(data.videoTestimonials, {
      keys: ['id', 'patientName', 'patientCountry', 'procedureName', 'videoUrl', 'thumbnailUrl', 'duration'],
    }),
    departments: summarizeArrayField(data.departments, {
      keys: ['name', 'doctorCount', 'annualSurgeryCases'],
    }),
    faqSections: summarizeArrayField(data.faqSections, {
      keys: ['heading', 'language', 'items'],
    }),
  };
}

export async function updateHospitalInfo(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  let result: unknown;

  try {
    result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/info`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const debugPayload = {
        hospitalId,
        status: error.status,
        responseBody: error.body,
        payloadSummary: summarizeMaterialsInfoPayload(data),
      };
      console.error('[hospital.materials.info] request failed', JSON.stringify({
        ...debugPayload,
      }, null, 2));
      throw new Error(`${MATERIALS_DEBUG_PREFIX}\n${JSON.stringify(debugPayload, null, 2)}`);
    }
    throw error;
  }

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

export async function uploadMaterialFile(
  materialKind: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{
  upload: { uploadUrl: string; storageKey: string; expiresIn: number };
  asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number };
}> {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  let result: unknown;
  try {
    result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/upload`, {
      method: 'POST',
      body: JSON.stringify({ ...params, materialKind }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const debugPayload = buildUploadDebugPayload({
        hospitalId,
        materialKind,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        error,
      });
      console.error('[hospital.materials.upload] init failed', JSON.stringify(debugPayload, null, 2));
      throw formatUploadDebugError(debugPayload);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[hospital.materials.upload] init failed', JSON.stringify({
      hospitalId,
      materialKind,
      ...params,
      message,
    }, null, 2));
    throw new Error(`${MATERIALS_UPLOAD_DEBUG_PREFIX}\n${JSON.stringify({
      hospitalId,
      materialKind,
      ...params,
      message,
    }, null, 2)}`);
  }
  return result as {
    upload: { uploadUrl: string; storageKey: string; expiresIn: number };
    asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number };
  };
}
