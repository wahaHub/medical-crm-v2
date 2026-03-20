import type { IStorageService, StorageBackend, IStorageAdapterRegistry } from '@medical-crm/domain';

export class StorageAdapterRegistry implements IStorageAdapterRegistry {
  private readonly adapters: Map<StorageBackend, IStorageService>;
  private readonly legacyAdapter: IStorageService;

  constructor(
    adapters: Partial<Record<StorageBackend, IStorageService>>,
    legacyAdapter: IStorageService,
  ) {
    this.adapters = new Map(Object.entries(adapters) as [StorageBackend, IStorageService][]);
    this.legacyAdapter = legacyAdapter;
  }

  get(backend: StorageBackend): IStorageService {
    const adapter = this.adapters.get(backend);
    if (!adapter) throw new Error(`No adapter registered for backend: ${backend}`);
    return adapter;
  }

  resolveForDownload(storageKey: string): IStorageService {
    if (storageKey.startsWith('crm/')) {
      if (storageKey.includes('/materials-beauty/')) return this.get('r2-materials-beauty');
      if (storageKey.includes('/materials-regular/')) return this.get('s3-materials');
      return this.get('r2-private');
    }
    if (storageKey.startsWith('hospital_photos/')) {
      return this.get('s3-materials');
    }
    return this.legacyAdapter;
  }
}
