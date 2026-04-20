import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';
import type { StorageAdapterRegistry } from './storage-adapter-registry.js';

export class RoutedStorageService implements IStorageService {
  constructor(private readonly registry: StorageAdapterRegistry) {}

  async createPresignedUpload(_key: string, _contentType: string): Promise<PresignedUploadResult> {
    throw new Error(
      'RoutedStorageService does not support direct uploads. Use MediaUploadService.createUploadIntent() instead.',
    );
  }

  async getSignedUrl(key: string): Promise<string> {
    const adapter = this.registry.resolveForDownload(key);
    return adapter.getSignedUrl(key);
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const groups = new Map<IStorageService, string[]>();
    for (const key of keys) {
      const adapter = this.registry.resolveForDownload(key);
      const group = groups.get(adapter) ?? [];
      group.push(key);
      groups.set(adapter, group);
    }
    const results: Record<string, string> = {};
    await Promise.all(
      [...groups.entries()].map(async ([adapter, groupKeys]) => {
        try {
          const urls = await adapter.getSignedUrls(groupKeys);
          Object.assign(results, urls);
          return;
        } catch (error) {
          console.warn('[RoutedStorageService] Batch signed URL generation failed for adapter group:', error);
        }

        const fallbackResults = await Promise.allSettled(
          groupKeys.map(async (key) => [key, await adapter.getSignedUrl(key)] as const),
        );
        for (const item of fallbackResults) {
          if (item.status === 'fulfilled') {
            const [key, signedUrl] = item.value;
            results[key] = signedUrl;
          } else {
            console.warn('[RoutedStorageService] Failed to sign storage key:', item.reason);
          }
        }
      }),
    );
    return results;
  }
}
