import type { IStorageService } from '@medical-crm/domain';

const STORAGE_KEY_PREFIXES = ['crm/', 'hospital_photos/'] as const;

export interface ResolvedMediaRef {
  url: string;
  storageKey: string | null;
}

export function isStorageKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && STORAGE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export async function resolveMediaRef(
  value: string | null | undefined,
  storage?: IStorageService,
): Promise<ResolvedMediaRef> {
  if (!value) return { url: '', storageKey: null };
  if (!storage || !isStorageKey(value)) return { url: value, storageKey: null };
  return {
    url: await storage.getSignedUrl(value),
    storageKey: value,
  };
}

export async function resolveMediaRefs(
  values: Array<string | null | undefined>,
  storage?: IStorageService,
): Promise<ResolvedMediaRef[]> {
  if (!storage) {
    return values.map((value) => ({ url: value ?? '', storageKey: null }));
  }

  const storageKeys = Array.from(new Set(values.filter(isStorageKey)));
  const resolved = storageKeys.length > 0 ? await storage.getSignedUrls(storageKeys) : {};

  return values.map((value) => {
    if (!value) return { url: '', storageKey: null };
    if (!isStorageKey(value)) return { url: value, storageKey: null };
    return {
      url: resolved[value] ?? value,
      storageKey: value,
    };
  });
}
