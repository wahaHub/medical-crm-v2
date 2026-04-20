import { describe, expect, it, vi } from 'vitest';
import { SupabaseStorageAdapter } from '../../storage/supabase-storage.adapter.js';
import { RoutedStorageService } from '../../storage/routed-storage.service.js';
import { StorageAdapterRegistry } from '../../storage/storage-adapter-registry.js';
import type { IStorageService } from '@medical-crm/domain';

describe('storage signing resiliency', () => {
  it('falls back to per-key Supabase signing when batch signing fails', async () => {
    const createSignedUrl = vi.fn()
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://storage.example.com/ok', path: 'documents/ok.pdf' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'fetch failed' },
      });

    const adapter = new SupabaseStorageAdapter({
      storage: {
        from: vi.fn(() => ({
          createSignedUrls: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'fetch failed' },
          }),
          createSignedUrl,
        })),
      },
    } as never);

    const result = await adapter.getSignedUrls(['documents/ok.pdf', 'documents/missing.pdf']);

    expect(result).toEqual({
      'documents/ok.pdf': 'https://storage.example.com/ok',
    });
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('returns partial routed signed URLs when one backend fails', async () => {
    const healthyAdapter: IStorageService = {
      createPresignedUpload: vi.fn(),
      getSignedUrl: vi.fn().mockResolvedValue('https://healthy.example.com/file'),
      getSignedUrls: vi.fn().mockImplementation(async (keys: string[]) =>
        Object.fromEntries(keys.map((key) => [key, 'https://healthy.example.com/file'])),
      ),
    };
    const failingAdapter: IStorageService = {
      createPresignedUpload: vi.fn(),
      getSignedUrl: vi.fn().mockRejectedValue(new Error('fetch failed')),
      getSignedUrls: vi.fn().mockRejectedValue(new Error('fetch failed')),
    };

    const registry = new StorageAdapterRegistry(
      {
        'r2-private': healthyAdapter,
        'supabase-legacy': failingAdapter,
      },
      failingAdapter,
    );
    const service = new RoutedStorageService(registry);

    const result = await service.getSignedUrls([
      'crm/dev/messages/conv/file.jpg',
      'documents/healthy.pdf',
    ]);

    expect(result).toEqual({
      'crm/dev/messages/conv/file.jpg': 'https://healthy.example.com/file',
    });
  });
});
