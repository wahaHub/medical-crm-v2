import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';

const UPLOAD_EXPIRY = 3600;
const DOWNLOAD_EXPIRY = 3600;

export class S3StorageAdapter implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cloudfrontUrl?: string;

  constructor(config: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    cloudfrontUrl?: string;
  }) {
    this.bucket = config.bucketName;
    this.cloudfrontUrl = config.cloudfrontUrl;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_EXPIRY });
    return { uploadUrl, storageKey: key, expiresIn: UPLOAD_EXPIRY };
  }

  async getSignedUrl(key: string): Promise<string> {
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl}/${key}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_EXPIRY });
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const entries = await Promise.all(
      keys.map(async (k) => [k, await this.getSignedUrl(k)] as const),
    );
    return Object.fromEntries(entries);
  }
}
