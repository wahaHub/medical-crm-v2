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
        const urls = await adapter.getSignedUrls(groupKeys);
        Object.assign(results, urls);
      }),
    );
    return results;
  }
}
