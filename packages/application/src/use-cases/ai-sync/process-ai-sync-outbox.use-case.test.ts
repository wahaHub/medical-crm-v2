import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSyncOutbox, DifyDocumentMapping } from '@medical-crm/domain';
import { ProcessAiSyncOutboxUseCase } from './process-ai-sync-outbox.use-case.js';

describe('ProcessAiSyncOutboxUseCase', () => {
  const outboxRepo = {
    enqueue: vi.fn(),
    claimBatch: vi.fn(),
    markDone: vi.fn(),
    markRetry: vi.fn(),
    markFailed: vi.fn(),
  };

  const mappingRepo = {
    findByEntity: vi.fn(),
    save: vi.fn(),
    deleteByEntity: vi.fn(),
  };

  const difyGateway = {
    createDocumentByText: vi.fn(),
    updateDocumentByText: vi.fn(),
    syncDocumentMetadata: vi.fn(),
    deleteDocument: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['DIFY_DATASET_FAQ_COSMETIC_ID'] = 'faq-cosmetic-dataset';
    process.env['DIFY_DATASET_FAQ_REGULAR_ID'] = 'faq-regular-dataset';
    process.env['DIFY_DATASET_PACKAGES_ID'] = 'packages-dataset';
  });

  it('deduplicates claimed jobs by entity and only processes the latest one', async () => {
    const older = buildFaqOutbox({ id: 'job-1', question: 'Old question?' });
    const latest = buildFaqOutbox({ id: 'job-2', question: 'Latest question?' });
    outboxRepo.claimBatch.mockResolvedValue([older, latest]);
    mappingRepo.findByEntity.mockResolvedValue(null);
    difyGateway.createDocumentByText.mockResolvedValue({ documentId: 'doc-1' });

    const useCase = new ProcessAiSyncOutboxUseCase(outboxRepo, mappingRepo, difyGateway);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 1, failed: 0, skipped: 1 });
    expect(outboxRepo.markDone).toHaveBeenCalledTimes(2);
    expect(outboxRepo.markDone).toHaveBeenCalledWith('job-1');
    expect(outboxRepo.markDone).toHaveBeenCalledWith('job-2');
    expect(difyGateway.createDocumentByText).toHaveBeenCalledTimes(1);
    expect(difyGateway.createDocumentByText).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: 'faq-cosmetic-dataset',
        name: expect.stringContaining('FAQ - General'),
        text: expect.stringContaining('Latest question?'),
      }),
    );
    expect(difyGateway.syncDocumentMetadata).toHaveBeenCalledWith({
      datasetId: 'faq-cosmetic-dataset',
      documentId: 'doc-1',
      metadata: {
        faq_id: 'faq-1',
        hospital_type: 'COSMETIC',
        scope: 'GLOBAL',
        category: 'General',
        hospital_id: null,
        keywords: 'recovery',
      },
    });
  });

  it('updates FAQ metadata separately from update_by_text for existing mappings', async () => {
    const job = buildFaqOutbox({ id: 'job-update', hospitalId: 'hospital-123', keywords: ['vip', 'pickup'] });
    const mapping = new DifyDocumentMapping({
      id: 'mapping-1',
      entityType: 'chatbot_faq_item',
      entityKey: 'chatbot_faq_item:faq-1',
      difyDatasetId: 'faq-cosmetic-dataset',
      difyDocumentId: 'doc-9',
      lastSyncedAt: new Date('2026-03-20T00:00:00Z'),
      createdAt: new Date('2026-03-20T00:00:00Z'),
      updatedAt: new Date('2026-03-20T00:00:00Z'),
    });
    outboxRepo.claimBatch.mockResolvedValue([job]);
    mappingRepo.findByEntity.mockResolvedValue(mapping);

    const useCase = new ProcessAiSyncOutboxUseCase(outboxRepo, mappingRepo, difyGateway);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(difyGateway.updateDocumentByText).toHaveBeenCalledWith({
      datasetId: 'faq-cosmetic-dataset',
      documentId: 'doc-9',
      name: expect.stringContaining('FAQ - General'),
      text: expect.stringContaining('What is recovery time?'),
    });
    expect(difyGateway.updateDocumentByText).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.anything(),
      }),
    );
    expect(difyGateway.syncDocumentMetadata).toHaveBeenCalledWith({
      datasetId: 'faq-cosmetic-dataset',
      documentId: 'doc-9',
      metadata: {
        faq_id: 'faq-1',
        hospital_type: 'COSMETIC',
        scope: 'HOSPITAL',
        category: 'General',
        hospital_id: 'hospital-123',
        keywords: 'vip, pickup',
      },
    });
  });

  it('retries failed upserts before max attempts', async () => {
    const job = buildFaqOutbox({ id: 'job-retry', attempts: 1 });
    outboxRepo.claimBatch.mockResolvedValue([job]);
    mappingRepo.findByEntity.mockResolvedValue(null);
    difyGateway.createDocumentByText.mockRejectedValue(new Error('dify unavailable'));

    const useCase = new ProcessAiSyncOutboxUseCase(outboxRepo, mappingRepo, difyGateway);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(outboxRepo.markRetry).toHaveBeenCalledOnce();
    expect(outboxRepo.markRetry).toHaveBeenCalledWith('job-retry', expect.any(Date));
    expect(outboxRepo.markFailed).not.toHaveBeenCalled();
  });

  it('marks jobs as failed after max retry attempts', async () => {
    const job = buildFaqOutbox({ id: 'job-failed', attempts: 2 });
    outboxRepo.claimBatch.mockResolvedValue([job]);
    mappingRepo.findByEntity.mockResolvedValue(null);
    difyGateway.createDocumentByText.mockRejectedValue(new Error('still failing'));

    const useCase = new ProcessAiSyncOutboxUseCase(outboxRepo, mappingRepo, difyGateway);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0 });
    expect(outboxRepo.markFailed).toHaveBeenCalledOnce();
    expect(outboxRepo.markFailed).toHaveBeenCalledWith('job-failed');
    expect(outboxRepo.markRetry).not.toHaveBeenCalled();
  });

  it('treats deletes without an existing mapping as a no-op', async () => {
    const job = buildFaqOutbox({ id: 'job-delete', action: 'DELETE' });
    outboxRepo.claimBatch.mockResolvedValue([job]);
    mappingRepo.findByEntity.mockResolvedValue(null);

    const useCase = new ProcessAiSyncOutboxUseCase(outboxRepo, mappingRepo, difyGateway);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(difyGateway.deleteDocument).not.toHaveBeenCalled();
    expect(mappingRepo.deleteByEntity).not.toHaveBeenCalled();
    expect(outboxRepo.markDone).toHaveBeenCalledWith('job-delete');
  });

  it('deletes mapped documents from dify and removes the local mapping', async () => {
    const job = buildFaqOutbox({ id: 'job-delete-mapped', action: 'DELETE' });
    const mapping = new DifyDocumentMapping({
      id: 'mapping-1',
      entityType: 'chatbot_faq_item',
      entityKey: 'chatbot_faq_item:faq-1',
      difyDatasetId: 'faq-cosmetic-dataset',
      difyDocumentId: 'doc-9',
      lastSyncedAt: new Date('2026-03-20T00:00:00Z'),
      createdAt: new Date('2026-03-20T00:00:00Z'),
      updatedAt: new Date('2026-03-20T00:00:00Z'),
    });
    outboxRepo.claimBatch.mockResolvedValue([job]);
    mappingRepo.findByEntity.mockResolvedValue(mapping);

    const useCase = new ProcessAiSyncOutboxUseCase(outboxRepo, mappingRepo, difyGateway);

    const result = await useCase.execute();

    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0 });
    expect(difyGateway.deleteDocument).toHaveBeenCalledWith({
      datasetId: 'faq-cosmetic-dataset',
      documentId: 'doc-9',
    });
    expect(mappingRepo.deleteByEntity).toHaveBeenCalledWith('chatbot_faq_item', 'chatbot_faq_item:faq-1');
    expect(outboxRepo.markDone).toHaveBeenCalledWith('job-delete-mapped');
  });
});

function buildFaqOutbox(
  overrides: Partial<{
    id: string;
    action: 'UPSERT' | 'DELETE';
    attempts: number;
    question: string;
    hospitalId: string | null;
    keywords: string[];
  }> = {},
): AiSyncOutbox {
  return new AiSyncOutbox({
    id: overrides.id ?? 'job-1',
    entityType: 'chatbot_faq_item',
    entityKey: 'chatbot_faq_item:faq-1',
    action: overrides.action ?? 'UPSERT',
    attempts: overrides.attempts ?? 0,
    nextRetryAt: null,
    status: 'PROCESSING',
    payload: {
      faqId: 'faq-1',
      category: 'General',
      question: overrides.question ?? 'What is recovery time?',
      answer: 'Most patients recover within a week.',
      hospitalType: 'COSMETIC',
      hospitalId: overrides.hospitalId ?? null,
      keywords: overrides.keywords ?? ['recovery'],
      attachments: [],
      isActive: true,
    },
    createdAt: new Date('2026-03-20T00:00:00Z'),
    updatedAt: new Date('2026-03-20T00:00:00Z'),
  });
}
