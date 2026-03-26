import type {
  IAiSyncOutboxRepository,
  IDifyDocumentMappingRepository,
  AiSyncOutbox,
} from '@medical-crm/domain';
import { DifyDocumentMapping } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';
import {
  renderFaqSyncDocument,
  renderPackageSyncDocument,
} from '../../services/ai-sync-task.service.js';

export interface AiSyncDocumentGateway {
  createDocumentByText(input: { datasetId: string; name: string; text: string }): Promise<{ documentId: string }>;
  updateDocumentByText(input: { datasetId: string; documentId: string; name?: string; text: string }): Promise<void>;
  deleteDocument(input: { datasetId: string; documentId: string }): Promise<void>;
}

export interface ProcessAiSyncOutboxResult {
  processed: number;
  failed: number;
  skipped: number;
}

const MAX_ATTEMPTS = 3;

export class ProcessAiSyncOutboxUseCase {
  constructor(
    private readonly outboxRepo: IAiSyncOutboxRepository,
    private readonly mappingRepo: IDifyDocumentMappingRepository,
    private readonly difyGateway: AiSyncDocumentGateway,
  ) {}

  async execute(batchSize = 20): Promise<ProcessAiSyncOutboxResult> {
    const claimed = await this.outboxRepo.claimBatch(batchSize);
    if (claimed.length === 0) {
      return { processed: 0, failed: 0, skipped: 0 };
    }

    const deduped = new Map<string, AiSyncOutbox>();
    const staleIds: string[] = [];

    for (const item of claimed) {
      const key = `${item.entityType}:${item.entityKey}`;
      const previous = deduped.get(key);
      if (previous) {
        staleIds.push(previous.id);
      }
      deduped.set(key, item);
    }

    for (const staleId of staleIds) {
      await this.outboxRepo.markDone(staleId);
    }

    let processed = 0;
    let failed = 0;
    const skipped = staleIds.length;

    for (const item of deduped.values()) {
      try {
        await this.processOne(item);
        await this.outboxRepo.markDone(item.id);
        processed++;
      } catch (error) {
        if (item.attempts + 1 >= MAX_ATTEMPTS) {
          await this.outboxRepo.markFailed(item.id);
        } else {
          await this.outboxRepo.markRetry(item.id, nextRetryAt(item.attempts));
        }
        failed++;
        if (process.env['NODE_ENV'] !== 'test') {
          console.error('[ai-sync-outbox] failed', {
            entityType: item.entityType,
            entityKey: item.entityKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { processed, failed, skipped };
  }

  private async processOne(item: AiSyncOutbox): Promise<void> {
    const datasetId = resolveDatasetId(item);
    if (!datasetId && item.action === 'UPSERT') {
      throw new Error(`Missing Dify dataset configuration for ${item.entityType}`);
    }

    if (item.action === 'DELETE') {
      const mapping = await this.mappingRepo.findByEntity(item.entityType, item.entityKey);
      if (!mapping) {
        return;
      }
      await this.difyGateway.deleteDocument({
        datasetId: mapping.difyDatasetId,
        documentId: mapping.difyDocumentId,
      });
      await this.mappingRepo.deleteByEntity(item.entityType, item.entityKey);
      return;
    }

    const ensuredDatasetId = datasetId;
    if (!ensuredDatasetId) {
      throw new Error(`Missing Dify dataset configuration for ${item.entityType}`);
    }

    const document = renderDocument(item);
    const existing = await this.mappingRepo.findByEntity(item.entityType, item.entityKey);

    if (existing) {
      await this.difyGateway.updateDocumentByText({
        datasetId: ensuredDatasetId,
        documentId: existing.difyDocumentId,
        name: document.name,
        text: document.text,
      });
      await this.mappingRepo.save(new DifyDocumentMapping({
        ...existing,
        difyDatasetId: ensuredDatasetId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }));
      return;
    }

    const created = await this.difyGateway.createDocumentByText({
      datasetId: ensuredDatasetId,
      name: document.name,
      text: document.text,
    });

    await this.mappingRepo.save(new DifyDocumentMapping({
      id: generateId(),
      entityType: item.entityType,
      entityKey: item.entityKey,
      difyDatasetId: ensuredDatasetId,
      difyDocumentId: created.documentId,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
}

function renderDocument(item: AiSyncOutbox): { name: string; text: string } {
  if (item.entityType === 'chatbot_faq_item') {
    return renderFaqSyncDocument({
      faqId: readString(item.payload.faqId, 'faqId'),
      category: readString(item.payload.category, 'category'),
      question: readString(item.payload.question, 'question'),
      answer: readString(item.payload.answer, 'answer'),
      hospitalType: readHospitalType(item.payload.hospitalType),
      hospitalId: readOptionalString(item.payload.hospitalId),
      keywords: readStringArray(item.payload.keywords),
      attachments: readAttachments(item.payload.attachments),
      isActive: Boolean(item.payload.isActive),
    });
  }

  if (item.entityType === 'package') {
    return renderPackageSyncDocument({
      packageId: readString(item.payload.packageId, 'packageId'),
      nameEn: readString(item.payload.nameEn, 'nameEn'),
      nameZh: readOptionalString(item.payload.nameZh),
      packageType: readString(item.payload.packageType, 'packageType'),
      price: readString(item.payload.price, 'price'),
      currency: readString(item.payload.currency, 'currency'),
      descriptionEn: readOptionalString(item.payload.descriptionEn),
      descriptionZh: readOptionalString(item.payload.descriptionZh),
      inclusions: item.payload.inclusions ?? null,
      status: readPackageStatus(item.payload.status),
    });
  }

  throw new Error(`Unsupported ai sync entity type: ${item.entityType}`);
}

function resolveDatasetId(item: AiSyncOutbox): string | null {
  if (item.entityType === 'chatbot_faq_item') {
    const hospitalType = readHospitalType(item.payload.hospitalType);
    return hospitalType === 'COSMETIC'
      ? process.env['DIFY_DATASET_FAQ_COSMETIC_ID'] ?? null
      : process.env['DIFY_DATASET_FAQ_REGULAR_ID'] ?? null;
  }

  if (item.entityType === 'package') {
    return process.env['DIFY_DATASET_PACKAGES_ID'] ?? null;
  }

  return null;
}

function nextRetryAt(attempts: number): Date {
  const minutes = Math.min(30, 2 ** attempts);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field} in ai sync payload`);
  }
  return value;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readAttachments(value: unknown): Array<{ fileName: string; storageKey: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const fileName = readOptionalString(record.fileName);
      const storageKey = readOptionalString(record.storageKey);
      if (!fileName || !storageKey) {
        return null;
      }
      return { fileName, storageKey };
    })
    .filter((item): item is { fileName: string; storageKey: string } => item !== null);
}

function readHospitalType(value: unknown): 'REGULAR' | 'COSMETIC' {
  if (value === 'REGULAR' || value === 'COSMETIC') {
    return value;
  }
  throw new Error('Invalid hospitalType in ai sync payload');
}

function readPackageStatus(value: unknown): 'DRAFT' | 'PUBLISHED' {
  if (value === 'DRAFT' || value === 'PUBLISHED') {
    return value;
  }
  throw new Error('Invalid package status in ai sync payload');
}
