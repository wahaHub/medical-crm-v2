import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R2StorageAdapter } from '../r2-storage.adapter.js';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}));

describe('R2StorageAdapter', () => {
  let adapter: R2StorageAdapter;

  beforeEach(() => {
    adapter = new R2StorageAdapter({
      accountId: 'test-account',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucketName: 'test-bucket',
    });
  });

  it('creates presigned upload URL', async () => {
    const result = await adapter.createPresignedUpload('crm/dev/test/key.jpg', 'image/jpeg');
    expect(result.uploadUrl).toBe('https://signed-url.example.com');
    expect(result.storageKey).toBe('crm/dev/test/key.jpg');
    expect(result.expiresIn).toBe(600);
    expect(result.path).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  it('gets signed download URL', async () => {
    const url = await adapter.getSignedUrl('crm/dev/test/key.jpg');
    expect(url).toBe('https://signed-url.example.com');
  });

  it('gets batch signed URLs', async () => {
    const urls = await adapter.getSignedUrls(['key1.jpg', 'key2.jpg']);
    expect(urls['key1.jpg']).toBe('https://signed-url.example.com');
    expect(urls['key2.jpg']).toBe('https://signed-url.example.com');
  });

  it('returns empty object for empty keys array', async () => {
    const urls = await adapter.getSignedUrls([]);
    expect(urls).toEqual({});
  });

  describe('with publicUrl (beauty materials mode)', () => {
    let publicAdapter: R2StorageAdapter;

    beforeEach(() => {
      publicAdapter = new R2StorageAdapter({
        accountId: 'test-account',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'medora-images',
        publicUrl: 'https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev',
      });
    });

    it('returns public URL for getSignedUrl instead of presigned', async () => {
      const url = await publicAdapter.getSignedUrl('materials-beauty/surgeon/123/ast_456/photo.jpg');
      expect(url).toBe('https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev/materials-beauty/surgeon/123/ast_456/photo.jpg');
    });

    it('still creates presigned upload URL', async () => {
      const result = await publicAdapter.createPresignedUpload('key.jpg', 'image/jpeg');
      expect(result.uploadUrl).toBe('https://signed-url.example.com');
    });
  });
});
