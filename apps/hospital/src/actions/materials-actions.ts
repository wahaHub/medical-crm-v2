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

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const raw = record[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
}

function summarizeMaterialsPackagePayload(data: Record<string, unknown>) {
  return {
    keys: Object.keys(data).sort(),
    slug: readStringField(data, 'slug'),
    title: readStringField(data, 'title'),
    subtitle: readStringField(data, 'subtitle'),
    summary: readStringField(data, 'summary'),
    price: readStringField(data, 'price'),
    currency: readStringField(data, 'currency'),
    gallery: summarizeArrayField(data.gallery, {
      keys: ['id', 'imageUrl', 'sortOrder'],
    }),
    tags: summarizeArrayField(data.tags, {
      keys: ['id', 'label', 'category'],
    }),
    includes: summarizeArrayField(data.includes, {
      keys: ['id', 'text', 'sortOrder'],
    }),
    process: summarizeArrayField(data.process, {
      keys: ['id', 'stepTitle', 'description', 'sortOrder'],
    }),
    cases: summarizeArrayField(data.cases, {
      keys: ['id', 'patientName', 'patientAge', 'patientCountry', 'story', 'result', 'sortOrder'],
    }),
    reviews: summarizeArrayField(data.reviews, {
      keys: ['id', 'reviewerName', 'reviewerCountry', 'rating', 'reviewDate', 'comment', 'sortOrder', 'isActive'],
    }),
  };
}

function summarizePackageSlugCollision(data: Record<string, unknown>, error: ApiError) {
  const body = error.body;
  const slug =
    readStringField(data, 'slug')
    ?? readStringField(body, 'slug')
    ?? readStringField(body, 'conflictingSlug')
    ?? readStringField(body, 'existingSlug');
  const title =
    readStringField(data, 'title')
    ?? readStringField(body, 'title')
    ?? readStringField(body, 'packageTitle')
    ?? readStringField(body, 'existingTitle');
  const conflictTitle =
    readStringField(body, 'conflictingTitle')
    ?? readStringField(body, 'existingPackageTitle');

  return {
    slug: slug ?? 'unknown',
    title: title ?? null,
    conflictTitle: conflictTitle ?? null,
    message: title
      ? `Package slug "${slug ?? 'unknown'}" already exists for "${title}".`
      : `Package slug "${slug ?? 'unknown'}" already exists.`,
  };
}

function readApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback;
  }

  const record = body as Record<string, unknown>;
  const fields = ['message', 'error', 'code', 'detail'];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return fallback;
}

async function callHospitalMaterialsEndpoint<T>(
  path: string,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  try {
    return await apiClient<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(readApiErrorMessage(error.body, fallbackError));
    }
    throw error;
  }
}

export async function createReview(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await callHospitalMaterialsEndpoint(
    `/api/v2/hospitals/${hospitalId}/materials/reviews`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    'Failed to create review.',
  );
  revalidatePath('/materials');
  return result;
}

export async function updateReview(id: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await callHospitalMaterialsEndpoint(
    `/api/v2/hospitals/${hospitalId}/materials/reviews/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
    'Failed to update review.',
  );
  revalidatePath('/materials');
  return result;
}

export async function deleteReview(id: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  await callHospitalMaterialsEndpoint(
    `/api/v2/hospitals/${hospitalId}/materials/reviews/${id}`,
    { method: 'DELETE' },
    'Failed to delete review.',
  );
  revalidatePath('/materials');
}

export async function createMaterialsPackage(data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  try {
    const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/packages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    revalidatePath('/materials');
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        const collision = summarizePackageSlugCollision(data, error);
        console.error('[hospital.materials.packages] slug collision', JSON.stringify({
          hospitalId,
          summary: summarizeMaterialsPackagePayload(data),
          collision,
          responseBody: error.body,
        }, null, 2));
        throw new Error(collision.message);
      }

      console.error('[hospital.materials.packages] create failed', JSON.stringify({
        hospitalId,
        summary: summarizeMaterialsPackagePayload(data),
        status: error.status,
        responseBody: error.body,
      }, null, 2));
      throw new Error(readApiErrorMessage(error.body, 'Failed to create package.'));
    }
    throw error;
  }
}

export async function updateMaterialsPackage(id: string, data: Record<string, unknown>) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  try {
    const result = await apiClient(`/api/v2/hospitals/${hospitalId}/materials/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    revalidatePath('/materials');
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        const collision = summarizePackageSlugCollision(data, error);
        console.error('[hospital.materials.packages] slug collision', JSON.stringify({
          hospitalId,
          packageId: id,
          summary: summarizeMaterialsPackagePayload(data),
          collision,
          responseBody: error.body,
        }, null, 2));
        throw new Error(collision.message);
      }

      console.error('[hospital.materials.packages] update failed', JSON.stringify({
        hospitalId,
        packageId: id,
        summary: summarizeMaterialsPackagePayload(data),
        status: error.status,
        responseBody: error.body,
      }, null, 2));
      throw new Error(readApiErrorMessage(error.body, 'Failed to update package.'));
    }
    throw error;
  }
}

export async function deleteMaterialsPackage(id: string) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  try {
    await apiClient(`/api/v2/hospitals/${hospitalId}/materials/packages/${id}`, {
      method: 'DELETE',
    });
    revalidatePath('/materials');
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('[hospital.materials.packages] delete failed', JSON.stringify({
        hospitalId,
        packageId: id,
        status: error.status,
        responseBody: error.body,
      }, null, 2));
      throw new Error(readApiErrorMessage(error.body, 'Failed to delete package.'));
    }
    throw error;
  }
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
