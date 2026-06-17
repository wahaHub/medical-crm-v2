import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaUploadService } from '../media-upload.service.js';
import { UploadPolicyRegistry } from '../../upload-policies/registry.js';
import { messageAttachmentPolicy } from '../../upload-policies/message-attachment.policy.js';

const mockRegistry = {
  get: vi.fn().mockReturnValue({
    createPresignedUpload: vi.fn().mockResolvedValue({
      uploadUrl: 'https://upload.example.com',
      storageKey: 'crm/dev/test',
      expiresIn: 600,
    }),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
  }),
  resolveForDownload: vi.fn(),
};

describe('MediaUploadService', () => {
  let service: MediaUploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    const policyRegistry = new UploadPolicyRegistry([messageAttachmentPolicy]);
    service = new MediaUploadService(policyRegistry, mockRegistry as any);
  });

  it('creates upload intent for valid input', async () => {
    const result = await service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'report.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
    expect(result.uploadUrl).toBe('https://upload.example.com');
    expect(result.storageKey).toContain('crm/');
    expect(result.storageKey).toContain('communications/messages');
    expect(result.storageKey).toContain('conv_123');
    expect(result.asset.fileName).toBe('report.pdf');
    expect(result.asset.storageKey).toBe(result.storageKey);
  });

  it('rejects invalid MIME type with ValidationError', async () => {
    await expect(service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'malware.exe',
      fileSize: 1024,
      mimeType: 'application/x-msdownload',
    })).rejects.toThrow(/MIME type not allowed/);
  });

  it('rejects file exceeding max size with ValidationError', async () => {
    await expect(service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'huge.pdf',
      fileSize: 101 * 1024 * 1024,
      mimeType: 'application/pdf',
    })).rejects.toThrow(/exceeds maximum/);
  });

  it('allows common medical media and office attachment types', async () => {
    await expect(service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'consultation.mov',
      fileSize: 10 * 1024 * 1024,
      mimeType: 'video/quicktime',
    })).resolves.toEqual(expect.objectContaining({
      asset: expect.objectContaining({ mimeType: 'video/quicktime' }),
    }));

    await expect(service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'labs.xlsx',
      fileSize: 1024,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).resolves.toEqual(expect.objectContaining({
      asset: expect.objectContaining({
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    }));
  });

  it('sanitizes file name in storage key', async () => {
    const result = await service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'My Report (Final).pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
    expect(result.storageKey).not.toContain(' ');
    expect(result.storageKey).not.toContain('(');
  });
});
