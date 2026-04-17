import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/errors';
import {
  buildUploadDebugPayload,
  formatUploadDebugError,
  MATERIALS_UPLOAD_DEBUG_PREFIX,
} from '@/lib/materials-upload-debug';

describe('materials upload debug helpers', () => {
  it('builds a payload with upload context and api error details', () => {
    const payload = buildUploadDebugPayload({
      hospitalId: 'hospital-1',
      materialKind: 'surgeon',
      fileName: 'doctor.heic',
      fileSize: 123456,
      mimeType: 'image/heic',
      error: new ApiError(400, {
        error: 'MIME type not allowed: image/heic',
      }),
    });

    expect(payload).toEqual({
      hospitalId: 'hospital-1',
      materialKind: 'surgeon',
      fileName: 'doctor.heic',
      fileSize: 123456,
      mimeType: 'image/heic',
      status: 400,
      responseBody: {
        error: 'MIME type not allowed: image/heic',
      },
    });
  });

  it('formats a copy-pastable error message', () => {
    const error = formatUploadDebugError({
      hospitalId: 'hospital-1',
      materialKind: 'case',
      fileName: 'before.heic',
      fileSize: 999,
      mimeType: 'image/heic',
      status: 400,
      responseBody: { error: 'MIME type not allowed' },
    });

    expect(error.message).toContain(MATERIALS_UPLOAD_DEBUG_PREFIX);
    expect(error.message).toContain('"materialKind": "case"');
    expect(error.message).toContain('"mimeType": "image/heic"');
    expect(error.message).toContain('"status": 400');
  });
});
