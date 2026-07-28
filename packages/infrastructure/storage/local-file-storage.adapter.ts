import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';

const UPLOAD_EXPIRY = 600; // 10 minutes
const DOWNLOAD_EXPIRY = 3600; // 1 hour

function encodeKey(key: string): string {
  return Buffer.from(key, 'utf-8').toString('base64url');
}

export interface LocalFileStorageAdapterConfig {
  /** Local directory where files are stored. */
  storageDir: string;
  /**
   * Public base URL used for upload/download links.
   * Should include the path to the local upload handler, e.g.
   * "http://localhost:3001/api/local-uploads".
   */
  baseUrl: string;
}

/**
 * Dev-only file storage adapter that keeps uploads on the local filesystem
 * instead of sending them to R2/S3. This avoids requiring real cloud credentials
 * or an external object store during local development.
 */
export class LocalFileStorageAdapter implements IStorageService {
  private readonly storageDir: string;
  private readonly baseUrl: string;

  constructor(config: LocalFileStorageAdapterConfig) {
    this.storageDir = config.storageDir;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  private filePath(key: string): string {
    // Keep the original key structure under the storage directory, but sanitize
    // path traversal attempts.
    const normalized = key.replace(/\.{2,}[\/\\]/g, '').replace(/^[\/\\]+/, '');
    return join(this.storageDir, normalized);
  }

  private uploadUrl(key: string): string {
    return `${this.baseUrl}?key=${encodeKey(key)}`;
  }

  async createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult> {
    void contentType;
    return {
      uploadUrl: this.uploadUrl(key),
      storageKey: key,
      expiresIn: UPLOAD_EXPIRY,
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    return `${this.uploadUrl(key)}&download=1&expiresIn=${DOWNLOAD_EXPIRY}`;
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await Promise.all(
      keys.map(async (key) => {
        result[key] = await this.getSignedUrl(key);
      }),
    );
    return result;
  }

  async saveFile(key: string, data: Buffer): Promise<void> {
    const path = this.filePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async readFile(key: string): Promise<Buffer> {
    return readFile(this.filePath(key));
  }
}
