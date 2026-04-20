import type { SupabaseClient } from '@supabase/supabase-js';
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';

const BUCKET = 'documents';
const DEFAULT_EXPIRY = 3600; // 1 hour

export class SupabaseStorageAdapter implements IStorageService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createPresignedUpload(key: string, _contentType: string): Promise<PresignedUploadResult> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(key);
    if (error || !data) {
      throw new Error(`Failed to create presigned upload: ${error?.message ?? 'unknown'}`);
    }
    return {
      uploadUrl: data.signedUrl,
      storageKey: key,
      path: data.path,
      token: data.token,
      expiresIn: DEFAULT_EXPIRY,
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, DEFAULT_EXPIRY);
    if (error || !data) {
      throw new Error(`Failed to get signed URL: ${error?.message ?? 'unknown'}`);
    }
    return data.signedUrl;
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};

    try {
      const { data, error } = await this.supabase.storage
        .from(BUCKET)
        .createSignedUrls(keys, DEFAULT_EXPIRY);
      if (error || !data) {
        throw new Error(`Failed to get signed URLs: ${error?.message ?? 'unknown'}`);
      }

      const result: Record<string, string> = {};
      for (const item of data) {
        if (item.signedUrl && item.path) {
          result[item.path] = item.signedUrl;
        }
      }
      return result;
    } catch (error) {
      console.warn('[SupabaseStorageAdapter] Batch signed URL generation failed, falling back to per-key signing:', error);
    }

    const result: Record<string, string> = {};
    const fallbackResults = await Promise.allSettled(
      keys.map(async (key) => [key, await this.getSignedUrl(key)] as const),
    );

    for (const item of fallbackResults) {
      if (item.status === 'fulfilled') {
        const [key, signedUrl] = item.value;
        result[key] = signedUrl;
      } else {
        console.warn('[SupabaseStorageAdapter] Failed to sign storage key:', item.reason);
      }
    }

    return result;
  }
}
