export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  path: string;
  token: string;
  expiresIn: number;
}

export interface IStorageService {
  createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult>;
  getSignedUrl(key: string): Promise<string>;
  getSignedUrls(keys: string[]): Promise<Record<string, string>>;
}
