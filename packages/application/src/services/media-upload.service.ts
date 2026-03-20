import { randomUUID } from 'node:crypto';
import type { IStorageAdapterRegistry } from '@medical-crm/domain';
import { ValidationError } from '@medical-crm/utils';
import type { UploadPolicyRegistry } from '../upload-policies/registry.js';
import type { CreateUploadIntentInput, UploadIntentResult } from '../upload-policies/types.js';

export class MediaUploadService {
  constructor(
    private readonly policyRegistry: UploadPolicyRegistry,
    private readonly adapterRegistry: IStorageAdapterRegistry,
  ) {}

  async createUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntentResult> {
    const policy = this.policyRegistry.get(input.policyId);

    if (!policy.allowedMimeTypes.includes(input.mimeType)) {
      throw new ValidationError(
        `MIME type not allowed: ${input.mimeType}. Allowed: ${policy.allowedMimeTypes.join(', ')}`,
      );
    }

    if (input.fileSize > policy.maxFileSize) {
      throw new ValidationError(
        `File size ${input.fileSize} exceeds maximum ${policy.maxFileSize} for policy ${policy.policyId}`,
      );
    }

    const assetId = randomUUID();
    const storageKey = policy.buildStorageKey(input, assetId);
    const adapter = this.adapterRegistry.get(policy.backend);
    const presigned = await adapter.createPresignedUpload(storageKey, input.mimeType);

    return {
      uploadUrl: presigned.uploadUrl,
      storageKey,
      expiresIn: presigned.expiresIn,
      asset: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        storageKey,
      },
    };
  }
}
