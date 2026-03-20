import { describe, it, expect, vi } from 'vitest';
import { RoutedStorageService } from '../routed-storage.service.js';
import { StorageAdapterRegistry } from '../storage-adapter-registry.js';
import type { IStorageService } from '@medical-crm/domain';

const mockAdapter = (name: string): IStorageService => ({
  createPresignedUpload: vi.fn(),
  getSignedUrl: vi.fn().mockResolvedValue(`${name}-url`),
  getSignedUrls: vi.fn().mockImplementation(async (keys: string[]) => {
    const result: Record<string, string> = {};
    for (const k of keys) result[k] = `${name}-url`;
    return result;
  }),
});

describe('RoutedStorageService', () => {
  const r2 = mockAdapter('r2');
  const r2Beauty = mockAdapter('r2-beauty');
  const s3 = mockAdapter('s3');
  const legacy = mockAdapter('supabase');
  const registry = new StorageAdapterRegistry(
    { 'r2-private': r2, 'r2-materials-beauty': r2Beauty, 's3-materials': s3, 'supabase-legacy': legacy },
    legacy,
  );
  const service = new RoutedStorageService(registry);

  it('throws on createPresignedUpload', async () => {
    await expect(service.createPresignedUpload('key', 'image/jpeg')).rejects.toThrow(
      'Use MediaUploadService',
    );
  });

  it('routes getSignedUrl for crm/ keys to R2', async () => {
    const url = await service.getSignedUrl('crm/dev/messages/conv/ast/file.jpg');
    expect(r2.getSignedUrl).toHaveBeenCalledWith('crm/dev/messages/conv/ast/file.jpg');
    expect(url).toBe('r2-url');
  });

  it('routes getSignedUrl for legacy keys to supabase', async () => {
    const url = await service.getSignedUrl('documents/case/doc/file.pdf');
    expect(legacy.getSignedUrl).toHaveBeenCalledWith('documents/case/doc/file.pdf');
    expect(url).toBe('supabase-url');
  });

  it('routes beauty materials to r2-beauty', async () => {
    const url = await service.getSignedUrl('crm/dev/materials-beauty/surgeon-image/hosp/ast/photo.jpg');
    expect(r2Beauty.getSignedUrl).toHaveBeenCalled();
    expect(url).toBe('r2-beauty-url');
  });

  it('groups batch getSignedUrls by backend', async () => {
    const urls = await service.getSignedUrls([
      'crm/dev/messages/conv/ast/file.jpg',
      'documents/case/doc/file.pdf',
    ]);
    expect(r2.getSignedUrls).toHaveBeenCalledWith(['crm/dev/messages/conv/ast/file.jpg']);
    expect(legacy.getSignedUrls).toHaveBeenCalledWith(['documents/case/doc/file.pdf']);
    expect(Object.keys(urls)).toHaveLength(2);
  });
});
