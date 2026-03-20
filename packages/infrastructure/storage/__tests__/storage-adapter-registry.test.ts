import { describe, it, expect, vi } from 'vitest';
import { StorageAdapterRegistry } from '../storage-adapter-registry.js';
import type { IStorageService } from '@medical-crm/domain';

const mockAdapter = (name: string): IStorageService => ({
  createPresignedUpload: vi.fn().mockResolvedValue({ uploadUrl: `${name}-upload`, storageKey: 'k', expiresIn: 600 }),
  getSignedUrl: vi.fn().mockResolvedValue(`${name}-download`),
  getSignedUrls: vi.fn().mockResolvedValue({}),
});

describe('StorageAdapterRegistry', () => {
  const r2 = mockAdapter('r2');
  const r2Beauty = mockAdapter('r2-beauty');
  const s3 = mockAdapter('s3');
  const legacy = mockAdapter('supabase');

  const registry = new StorageAdapterRegistry(
    { 'r2-private': r2, 'r2-materials-beauty': r2Beauty, 's3-materials': s3, 'supabase-legacy': legacy },
    legacy,
  );

  it('gets adapter by backend name', () => {
    expect(registry.get('r2-private')).toBe(r2);
    expect(registry.get('r2-materials-beauty')).toBe(r2Beauty);
    expect(registry.get('s3-materials')).toBe(s3);
  });

  it('throws for unknown backend', () => {
    expect(() => registry.get('unknown' as any)).toThrow('No adapter registered');
  });

  it('routes crm/ CRM media keys to r2-private', () => {
    expect(registry.resolveForDownload('crm/dev/communications/messages/abc/ast_123/file.jpg')).toBe(r2);
  });

  it('routes crm/*/materials-beauty/ keys to r2-materials-beauty', () => {
    expect(registry.resolveForDownload('crm/dev/materials-beauty/surgeon-image/abc/ast_123/file.jpg')).toBe(r2Beauty);
  });

  it('routes crm/*/materials-regular/ keys to s3-materials', () => {
    expect(registry.resolveForDownload('crm/dev/materials-regular/hospital-image/abc/ast_123/file.jpg')).toBe(s3);
  });

  it('routes hospital_photos/ keys to s3-materials', () => {
    expect(registry.resolveForDownload('hospital_photos/public/123/hero.jpg')).toBe(s3);
  });

  it('routes legacy keys to supabase', () => {
    expect(registry.resolveForDownload('documents/case_123/doc_456/file.pdf')).toBe(legacy);
    expect(registry.resolveForDownload('messages/conv_123/uuid-file.jpg')).toBe(legacy);
    expect(registry.resolveForDownload('packages/images/uuid-cover.jpg')).toBe(legacy);
  });
});
