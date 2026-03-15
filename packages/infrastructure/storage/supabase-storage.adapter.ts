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
  }
}
