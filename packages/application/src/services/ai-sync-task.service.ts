import type { IAiSyncOutboxRepository } from '@medical-crm/domain';
import { AiSyncOutbox } from '@medical-crm/domain';
import { generateId } from '@medical-crm/utils';

export interface FaqSyncPayload {
  faqId: string;
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  keywords: string[];
  attachments: Array<{ fileName: string; storageKey: string }>;
  isActive: boolean;
}

export interface PackageSyncPayload {
  packageId: string;
  nameEn: string;
  nameZh: string | null;
  packageType: string;
  price: string;
  currency: string;
  descriptionEn: string | null;
  descriptionZh: string | null;
  inclusions: unknown;
  status: 'DRAFT' | 'PUBLISHED';
}

export class AiSyncTaskService {
  constructor(private readonly outboxRepo: IAiSyncOutboxRepository) {}

  async enqueueFaqUpsert(payload: FaqSyncPayload): Promise<void> {
    await this.enqueue({
      entityType: 'chatbot_faq_item',
      entityKey: buildFaqEntityKey(payload.faqId),
      action: payload.isActive ? 'UPSERT' : 'DELETE',
      payload,
    });
  }

  async enqueueFaqDelete(payload: Pick<FaqSyncPayload, 'faqId' | 'hospitalType' | 'hospitalId'>): Promise<void> {
    await this.enqueue({
      entityType: 'chatbot_faq_item',
      entityKey: buildFaqEntityKey(payload.faqId),
      action: 'DELETE',
      payload,
    });
  }

  async enqueuePackageUpsert(payload: PackageSyncPayload): Promise<void> {
    await this.enqueue({
      entityType: 'package',
      entityKey: buildPackageEntityKey(payload.packageId),
      action: payload.status === 'PUBLISHED' ? 'UPSERT' : 'DELETE',
      payload,
    });
  }

  async enqueuePackageDelete(payload: Pick<PackageSyncPayload, 'packageId'>): Promise<void> {
    await this.enqueue({
      entityType: 'package',
      entityKey: buildPackageEntityKey(payload.packageId),
      action: 'DELETE',
      payload,
    });
  }

  private async enqueue(input: {
    entityType: string;
    entityKey: string;
    action: 'UPSERT' | 'DELETE';
    payload: object;
  }): Promise<void> {
    const now = new Date();
    await this.outboxRepo.enqueue(new AiSyncOutbox({
      id: generateId(),
      entityType: input.entityType,
      entityKey: input.entityKey,
      action: input.action,
      attempts: 0,
      nextRetryAt: null,
      status: 'PENDING',
      payload: input.payload as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    }));
  }
}

export function buildFaqEntityKey(faqId: string): string {
  return `chatbot_faq_item:${faqId}`;
}

export function buildPackageEntityKey(packageId: string): string {
  return `package:${packageId}`;
}

export function renderFaqSyncDocument(payload: FaqSyncPayload): { name: string; text: string } {
  const lines = [
    `Category: ${payload.category}`,
    `Hospital Type: ${payload.hospitalType}`,
    `Hospital Scope: ${payload.hospitalId ?? 'GLOBAL'}`,
    '',
    `Question: ${payload.question}`,
    '',
    'Answer:',
    payload.answer,
  ];

  if (payload.keywords.length > 0) {
    lines.push('', `Keywords: ${payload.keywords.join(', ')}`);
  }

  if (payload.attachments.length > 0) {
    lines.push('', 'Attachments:');
    for (const attachment of payload.attachments) {
      lines.push(`- ${attachment.fileName}`);
    }
  }

  return {
    name: `FAQ - ${payload.category} - ${payload.question.slice(0, 80)}`,
    text: lines.join('\n'),
  };
}

export function renderPackageSyncDocument(payload: PackageSyncPayload): { name: string; text: string } {
  const lines = [
    `Package Type: ${payload.packageType}`,
    `Status: ${payload.status}`,
    `Price: ${payload.price} ${payload.currency}`,
  ];

  if (payload.nameZh) {
    lines.push(`Name (ZH): ${payload.nameZh}`);
  }
  if (payload.descriptionEn) {
    lines.push('', 'Description (EN):', payload.descriptionEn);
  }
  if (payload.descriptionZh) {
    lines.push('', 'Description (ZH):', payload.descriptionZh);
  }
  if (payload.inclusions !== null && payload.inclusions !== undefined) {
    lines.push('', 'Inclusions:', JSON.stringify(payload.inclusions, null, 2));
  }

  return {
    name: `Package - ${payload.nameEn}`,
    text: lines.join('\n'),
  };
}
