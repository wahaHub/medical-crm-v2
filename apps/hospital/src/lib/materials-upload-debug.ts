import { ApiError } from '@/lib/errors';

export const MATERIALS_UPLOAD_DEBUG_PREFIX = '[hospital.materials.upload]';

export type UploadDebugPayload = {
  hospitalId: string;
  materialKind: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: number;
  responseBody: unknown;
};

export function buildUploadDebugPayload(input: {
  hospitalId: string;
  materialKind: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  error: ApiError;
}): UploadDebugPayload {
  return {
    hospitalId: input.hospitalId,
    materialKind: input.materialKind,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    status: input.error.status,
    responseBody: input.error.body,
  };
}

export function formatUploadDebugError(payload: UploadDebugPayload): Error {
  return new Error(`${MATERIALS_UPLOAD_DEBUG_PREFIX}\n${JSON.stringify(payload, null, 2)}`);
}
