import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageAdapter } from '../s3-storage.adapter.js';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3-signed.example.com'),
}));

describe('S3StorageAdapter', () => {
  describe('with CloudFront', () => {
    let adapter: S3StorageAdapter;

    beforeEach(() => {
      adapter = new S3StorageAdapter({
        region: 'eu-west-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'medchina-cloudfront',
        cloudfrontUrl: 'https://d1wwcixye6at8o.cloudfront.net',
      });
    });

    it('creates presigned upload with CacheControl', async () => {
      const result = await adapter.createPresignedUpload('hospital_photos/test.jpg', 'image/jpeg');
      expect(result.uploadUrl).toBe('https://s3-signed.example.com');
      expect(result.storageKey).toBe('hospital_photos/test.jpg');
      expect(result.expiresIn).toBe(3600);
    });

    it('returns CloudFront URL for getSignedUrl (not S3 presigned)', async () => {
      const url = await adapter.getSignedUrl('hospital_photos/public/123/hero.jpg');
      expect(url).toBe('https://d1wwcixye6at8o.cloudfront.net/hospital_photos/public/123/hero.jpg');
    });

    it('returns CloudFront URLs for batch', async () => {
      const urls = await adapter.getSignedUrls(['key1.jpg', 'key2.jpg']);
      expect(urls['key1.jpg']).toBe('https://d1wwcixye6at8o.cloudfront.net/key1.jpg');
      expect(urls['key2.jpg']).toBe('https://d1wwcixye6at8o.cloudfront.net/key2.jpg');
    });
  });

  describe('without CloudFront', () => {
    let adapter: S3StorageAdapter;

    beforeEach(() => {
      adapter = new S3StorageAdapter({
        region: 'eu-west-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'test-bucket',
      });
    });

    it('falls back to S3 presigned URL for getSignedUrl', async () => {
      const url = await adapter.getSignedUrl('some/key.jpg');
      expect(url).toBe('https://s3-signed.example.com');
    });
  });
});
