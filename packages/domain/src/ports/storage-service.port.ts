export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  path?: string;
  token?: string;
  expiresIn: number;
}

export interface IStorageService {
  createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult>;

  /**
   * Returns a download URL for the given storage key.
   * May return a signed temporary URL (R2, Supabase) or
   * a controlled public URL (CloudFront-backed S3 or public R2 beauty materials).
   * Callers should treat the result as an opaque download URL
   * with no assumption about expiry semantics.
   */
  getSignedUrl(key: string): Promise<string>;
  getSignedUrls(keys: string[]): Promise<Record<string, string>>;
}
