import { describe, expect, it, vi } from 'vitest';
import { ServerSideUploadService } from '../server-side-upload.service.js';

describe('ServerSideUploadService', () => {
  it('uploads Uint8Array bytes to a presigned URL with exact MIME type', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const service = new ServerSideUploadService(fetchImpl);

    await service.uploadBytes({
      uploadUrl: 'https://storage.example.com/upload',
      bytes,
      mimeType: 'image/png',
      label: 'attachment',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://storage.example.com/upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: bytes,
    });
  });

  it('throws a readable error when storage upload response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('signature expired', { status: 403 }));
    const service = new ServerSideUploadService(fetchImpl);

    await expect(
      service.uploadBytes({
        uploadUrl: 'https://storage.example.com/upload',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
        label: 'patient document',
      }),
    ).rejects.toThrow('patient document upload failed: 403 signature expired');
  });

  it('does not log or persist file bytes in upload failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const byteContents = 'private-byte-contents';
    const bytes = new TextEncoder().encode(byteContents);
    const fetchImpl = vi.fn().mockResolvedValue(new Response('upstream denied', { status: 500 }));
    const service = new ServerSideUploadService(fetchImpl);

    await expect(
      service.uploadBytes({
        uploadUrl: 'https://storage.example.com/upload',
        bytes,
        mimeType: 'application/pdf',
        label: 'sensitive attachment',
      }),
    ).rejects.not.toThrow(byteContents);

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleLog.mockRestore();
  });
});
